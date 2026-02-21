import fs from "fs";
import path from "path";

export interface SkillMetadata {
  name: string;
  description: string;
  id: string;
}

export interface SkillDetails extends SkillMetadata {
  content: string;
}

export class SkillRegistry {
  private static readonly SKILLS_DIR = path.join(process.cwd(), ".agent", "skills");

  /**
   * Get metadata for all available skills
   */
  static async listSkills(): Promise<SkillMetadata[]> {
    if (!fs.existsSync(this.SKILLS_DIR)) {
      return [];
    }

    const folders = fs.readdirSync(this.SKILLS_DIR, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory());

    const skills: SkillMetadata[] = [];

    for (const folder of folders) {
      const skillPath = path.join(this.SKILLS_DIR, folder.name, "SKILL.md");
      if (fs.existsSync(skillPath)) {
        const content = fs.readFileSync(skillPath, "utf-8");
        const metadata = this.parseMetadata(content, folder.name);
        if (metadata) {
          skills.push(metadata);
        }
      }
    }

    return skills;
  }

  /**
   * Get full details for a specific skill
   */
  static async getSkill(id: string): Promise<SkillDetails | null> {
    const skillPath = path.join(this.SKILLS_DIR, id, "SKILL.md");
    if (!fs.existsSync(skillPath)) {
      return null;
    }

    const content = fs.readFileSync(skillPath, "utf-8");
    const metadata = this.parseMetadata(content, id);
    
    if (!metadata) return null;

    return {
      ...metadata,
      content: content.replace(/---[\s\S]*?---/, "").trim(),
    };
  }

  /**
   * Simple parser for YAML frontmatter
   */
  private static parseMetadata(content: string, id: string): SkillMetadata | null {
    const match = content.match(/---([\s\S]*?)---/);
    if (!match) return null;

    const yaml = match[1];
    const name = yaml.match(/name:\s*(.*)/)?.[1]?.trim();
    const description = yaml.match(/description:\s*(.*)/)?.[1]?.trim();

    if (!name || !description) return null;

    return { name, description, id };
  }
}
