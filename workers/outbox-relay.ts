import os from "node:os";

import { nanoid } from "nanoid";
import type { Redis } from "ioredis";
import type { Client } from "pg";

import { publishPendingOutboxEntries } from "@/lib/collaboration-service";
import { env } from "@/lib/env";
import { createPostgresClient } from "@/lib/postgres-client";
import { getRedisClient } from "@/lib/redis";

const OUTBOX_LEADER_LOCK_KEY_A = 42_817;
const OUTBOX_LEADER_LOCK_KEY_B = 1;
const LEADERSHIP_RETRY_MS = 5_000;
const MAX_RECOVERY_FAILURES = 5;

export type OutboxRelayHandle = {
  stop: () => Promise<void>;
};

// The relay keeps all row-level outbox work in Drizzle. We only use a dedicated
// pg client here for session-scoped Postgres primitives: LISTEN/NOTIFY and
// advisory locks.
class OutboxRelay implements OutboxRelayHandle {
  private readonly owner = `outbox-relay:${os.hostname()}:${process.pid}:${nanoid(6)}`;
  private readonly redis: Redis = getRedisClient({ fresh: true });
  private leadershipClient: Client | null = null;
  private leadershipRetryTimer: ReturnType<typeof setTimeout> | null = null;
  private fallbackSweepTimer: ReturnType<typeof setInterval> | null = null;
  private drainPromise: Promise<void> | null = null;
  private drainQueued = false;
  private stopped = false;
  private unexpectedFailureCount = 0;

  async start() {
    await this.tryAcquireLeadership();
  }

  async stop() {
    this.stopped = true;

    if (this.leadershipRetryTimer) {
      clearTimeout(this.leadershipRetryTimer);
      this.leadershipRetryTimer = null;
    }

    if (this.fallbackSweepTimer) {
      clearInterval(this.fallbackSweepTimer);
      this.fallbackSweepTimer = null;
    }

    await this.drainPromise?.catch(() => {});
    await this.releaseLeadership("shutdown");

    try {
      await this.redis.quit();
    } catch {
      this.redis.disconnect();
    }
  }

  private async tryAcquireLeadership() {
    if (this.stopped || this.leadershipClient) {
      return;
    }

    let client: Client | null = null;
    try {
      client = createPostgresClient();
      await client.connect();

      const result = await client.query<{ locked: boolean }>(
        "select pg_try_advisory_lock($1, $2) as locked",
        [OUTBOX_LEADER_LOCK_KEY_A, OUTBOX_LEADER_LOCK_KEY_B],
      );

      if (!result.rows[0]?.locked) {
        await client.end().catch(() => {});
        this.scheduleLeadershipRetry();
        return;
      }

      client.on("notification", (message) => {
        if (message.channel !== env.OUTBOX_NOTIFY_CHANNEL) {
          return;
        }

        console.info("[outbox-relay] notify received", {
          channel: message.channel,
        });
        this.requestDrain();
      });

      client.on("error", (error) => {
        void this.handleLeadershipFailure("listener_error", error);
      });

      client.on("end", () => {
        void this.handleLeadershipFailure("listener_end");
      });

      await client.query(`listen "${env.OUTBOX_NOTIFY_CHANNEL}"`);

      this.leadershipClient = client;
      this.unexpectedFailureCount = 0;

      console.info("[outbox-relay] leadership acquired", {
        owner: this.owner,
        channel: env.OUTBOX_NOTIFY_CHANNEL,
      });

      this.fallbackSweepTimer = setInterval(() => {
        this.requestDrain();
      }, env.OUTBOX_SWEEP_INTERVAL_MS);
      this.fallbackSweepTimer.unref?.();

      this.requestDrain();
    } catch (error) {
      if (client) {
        await client.end().catch(() => {});
      }

      this.unexpectedFailureCount += 1;
      console.error("[outbox-relay] leadership acquisition failed", {
        owner: this.owner,
        attempt: this.unexpectedFailureCount,
        message: error instanceof Error ? error.message : "Unknown error",
      });

      if (this.unexpectedFailureCount >= MAX_RECOVERY_FAILURES) {
        process.exit(1);
      }

      this.scheduleLeadershipRetry();
    }
  }

  private requestDrain() {
    if (this.stopped || !this.leadershipClient) {
      return;
    }

    if (this.drainPromise) {
      this.drainQueued = true;
      return;
    }

    this.drainPromise = this.drainLoop()
      .catch((error) => {
        console.error("[outbox-relay] drain failed", {
          owner: this.owner,
          message: error instanceof Error ? error.message : "Unknown error",
        });
      })
      .finally(() => {
        this.drainPromise = null;

        if (this.drainQueued && !this.stopped && this.leadershipClient) {
          this.drainQueued = false;
          this.requestDrain();
        }
      });
  }

  private async drainLoop() {
    do {
      this.drainQueued = false;

      const result = await publishPendingOutboxEntries({
        limit: env.OUTBOX_BATCH_SIZE,
        owner: this.owner,
        redisClient: this.redis,
      });

      if (result.claimedCount > 0) {
        console.info("[outbox-relay] batch processed", {
          owner: this.owner,
          claimedCount: result.claimedCount,
          publishedCount: result.publishedCount,
          reclaimedCount: result.reclaimedCount,
          failedCount: result.failedEntries.length,
        });
      }

      for (const failure of result.failedEntries) {
        console.error("[outbox-relay] publish failure", failure);
      }

      if (
        this.stopped ||
        !this.leadershipClient ||
        result.claimedCount < env.OUTBOX_BATCH_SIZE
      ) {
        break;
      }
    } while (true);
  }

  private scheduleLeadershipRetry() {
    if (this.stopped || this.leadershipRetryTimer) {
      return;
    }

    this.leadershipRetryTimer = setTimeout(() => {
      this.leadershipRetryTimer = null;
      void this.tryAcquireLeadership();
    }, LEADERSHIP_RETRY_MS);
    this.leadershipRetryTimer.unref?.();
  }

  private async handleLeadershipFailure(reason: string, error?: unknown) {
    if (this.stopped || !this.leadershipClient) {
      return;
    }

    this.unexpectedFailureCount += 1;
    console.error("[outbox-relay] leadership lost", {
      owner: this.owner,
      reason,
      attempt: this.unexpectedFailureCount,
      message: error instanceof Error ? error.message : undefined,
    });

    await this.releaseLeadership(reason);

    if (this.unexpectedFailureCount >= MAX_RECOVERY_FAILURES) {
      process.exit(1);
    }

    this.scheduleLeadershipRetry();
  }

  private async releaseLeadership(reason: string) {
    if (this.fallbackSweepTimer) {
      clearInterval(this.fallbackSweepTimer);
      this.fallbackSweepTimer = null;
    }

    const client = this.leadershipClient;
    this.leadershipClient = null;

    if (!client) {
      return;
    }

    client.removeAllListeners("notification");
    client.removeAllListeners("error");
    client.removeAllListeners("end");

    try {
      await client.query(`unlisten "${env.OUTBOX_NOTIFY_CHANNEL}"`);
    } catch {
      // Ignore listener teardown failures during shutdown/recovery.
    }

    try {
      await client.query("select pg_advisory_unlock($1, $2)", [
        OUTBOX_LEADER_LOCK_KEY_A,
        OUTBOX_LEADER_LOCK_KEY_B,
      ]);
    } catch {
      // Closing the connection also releases the advisory lock.
    }

    await client.end().catch(() => {});

    console.info("[outbox-relay] leadership released", {
      owner: this.owner,
      reason,
    });
  }
}

export async function startOutboxRelay(): Promise<OutboxRelayHandle | null> {
  if (!env.OUTBOX_RELAY_ENABLED) {
    return null;
  }

  const relay = new OutboxRelay();
  await relay.start();
  return relay;
}
