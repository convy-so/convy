"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  createFolderAction,
  updateFolderAction,
  deleteFolderAction,
  addSurveyToFolderAction,
  removeSurveyFromFolderAction,
} from "@/app/actions/folder";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";

// Keys
export const folderKeys = {
  all: () => ["folders"] as const,
  lists: () => [...folderKeys.all(), "list"] as const,
  detail: (id: string) => ["folders", "detail", id] as const,
};

export const surveyKeys = {
  all: () => ["surveys"] as const,
  lists: () => [...surveyKeys.all(), "list"] as const,
};

// Mutations
export function useCreateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      color?: string;
    }) => {
      const result = await createFolderAction(data);
      if (!result.success) throw new Error(getFriendlyActionError(result.error));
      return result.data;
    },
    onMutate: async (newFolder) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: folderKeys.lists(),
      });

      // Snapshot the previous value
      const previousFolders = queryClient.getQueryData(
        folderKeys.lists(),
      );

      // Optimistically update to the new value
      queryClient.setQueryData(folderKeys.lists(), (old: Record<string, unknown>[] | undefined) => [
        ...(old || []),
        { ...newFolder, id: "temp-id", createdAt: new Date() },
      ]);

      // Return a context object with the snapshotted value
      return { previousFolders };
    },
    onSuccess: () => {
      toast.success("Folder created");
    },
    onError: (err, _newFolder, context: { previousFolders?: unknown } | undefined) => {
      toast.error(err.message);
      // Rollback to the previous value
        queryClient.setQueryData(
        folderKeys.lists(),
        context?.previousFolders,
      );
    },
    onSettled: () => {
      // Always refetch after error or success to ensure sync
      void queryClient.invalidateQueries({
        queryKey: folderKeys.lists(),
      });
    },
  });
}

export function useUpdateFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (data: {
      id: string;
      name?: string;
      description?: string;
    }) => {
      const result = await updateFolderAction(data);
      if (!result.success) throw new Error(getFriendlyActionError(result.error));
      return result.data;
    },
    onMutate: async (updatedFolder) => {
      await queryClient.cancelQueries({
        queryKey: folderKeys.lists(),
      });
      await queryClient.cancelQueries({
        queryKey: folderKeys.detail(updatedFolder.id),
      });

      const previousFolders = queryClient.getQueryData(
        folderKeys.lists(),
      );
      const previousFolder = queryClient.getQueryData(
        folderKeys.detail(updatedFolder.id),
      );

      queryClient.setQueryData(folderKeys.lists(), (old: Array<Record<string, unknown>> | undefined) =>
        old?.map((p) =>
          p.id === updatedFolder.id ? { ...p, ...updatedFolder } : p,
        ),
      );
      queryClient.setQueryData(
        folderKeys.detail(updatedFolder.id),
        (old: Record<string, unknown> | undefined) => ({ ...(old || {}), ...updatedFolder }),
      );

      return { previousFolders, previousFolder };
    },
    onSuccess: () => {
      toast.success("Folder updated");
    },
    onError: (err, updatedFolder, context: { previousFolders?: unknown, previousFolder?: unknown } | undefined) => {
      toast.error(err.message);
        queryClient.setQueryData(
        folderKeys.lists(),
        context?.previousFolders,
      );
      queryClient.setQueryData(
        folderKeys.detail(updatedFolder.id),
        context?.previousFolder,
      );
    },
    onSettled: (_, __, variables) => {
      void queryClient.invalidateQueries({
        queryKey: folderKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: folderKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteFolderAction(id);
      if (!result.success) throw new Error(getFriendlyActionError(result.error));
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: folderKeys.lists(),
      });

      const previousFolders = queryClient.getQueryData(
        folderKeys.lists(),
      );

      queryClient.setQueryData(folderKeys.lists(), (old: Array<Record<string, unknown>> | undefined) =>
        old?.filter((p) => p.id !== id),
      );

      return { previousFolders };
    },
    onSuccess: () => {
      toast.success("Folder deleted");
    },
    onError: (err, _, context: { previousFolders?: unknown } | undefined) => {
      toast.error(err.message);
        queryClient.setQueryData(
        folderKeys.lists(),
        context?.previousFolders,
      );
    },
    onSettled: () => {
      void queryClient.invalidateQueries({
        queryKey: folderKeys.lists(),
      });
      void queryClient.invalidateQueries({
        queryKey: surveyKeys.lists(),
      });
    },
  });
}

export function useAddSurveyToFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      folderId,
      surveyId,
    }: {
      folderId: string;
      surveyId: string;
    }) => {
      const result = await addSurveyToFolderAction(folderId, surveyId);
      if (!result.success) throw new Error(getFriendlyActionError(result.error));
      return result.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Survey added to folder");
      void queryClient.invalidateQueries({
        queryKey: folderKeys.detail(variables.folderId),
      });
      void queryClient.invalidateQueries({
        queryKey: folderKeys.lists(),
      }); // Update counts
      void queryClient.invalidateQueries({
        queryKey: surveyKeys.lists(),
      }); // Update available surveys
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useRemoveSurveyFromFolder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      folderId,
      surveyId,
    }: {
      folderId: string;
      surveyId: string;
    }) => {
      const result = await removeSurveyFromFolderAction(folderId, surveyId);
      if (!result.success) throw new Error(getFriendlyActionError(result.error));
      return result.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Survey removed from folder");
      void queryClient.invalidateQueries({
        queryKey: folderKeys.detail(variables.folderId),
      });
      void queryClient.invalidateQueries({
        queryKey: folderKeys.lists(),
      }); // Update counts
      void queryClient.invalidateQueries({
        queryKey: surveyKeys.lists(),
      }); // Update available surveys
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}


