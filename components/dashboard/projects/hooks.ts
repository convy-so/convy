"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  getProjectsAction,
  getProjectAction,
  createProjectAction,
  updateProjectAction,
  deleteProjectAction,
  addSurveyToProjectAction,
  removeSurveyFromProjectAction,
} from "@/app/actions/project";
import { getSurveysAction } from "@/app/actions/survey";
import { useAuth } from "@/components/providers/auth-provider";

// Keys
export const projectKeys = {
  all: (orgId?: string | null) => ["projects", orgId] as const,
  lists: (orgId?: string | null) =>
    [...projectKeys.all(orgId), "list"] as const,
  detail: (id: string) => ["projects", "detail", id] as const,
};

export const surveyKeys = {
  all: (orgId?: string | null) => ["surveys", orgId] as const,
  lists: (orgId?: string | null) => [...surveyKeys.all(orgId), "list"] as const,
};

// Queries
export function useProjects() {
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useQuery({
    queryKey: projectKeys.lists(activeOrgId),
    queryFn: async () => {
      const result = await getProjectsAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useProject(id: string) {
  return useQuery({
    queryKey: projectKeys.detail(id),
    queryFn: async () => {
      const result = await getProjectAction(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

// Helper query to get surveys available for assignment (no project)
export function useAvailableSurveys() {
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useQuery({
    queryKey: surveyKeys.lists(activeOrgId),
    queryFn: async () => {
      const result = await getSurveysAction();
      if (!result.success) throw new Error(result.error);
      // Filter client-side for simplicity, or backend action could optionally filter
      return result.data.filter((s) => !s.projectId);
    },
  });
}

// Mutations
export function useCreateProject() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      color?: string;
    }) => {
      const result = await createProjectAction(data);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Project created");
      queryClient.invalidateQueries({
        queryKey: projectKeys.lists(activeOrgId),
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useUpdateProject() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async (data: {
      id: string;
      name?: string;
      description?: string;
    }) => {
      const result = await updateProjectAction(data);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Project updated");
      queryClient.invalidateQueries({
        queryKey: projectKeys.lists(activeOrgId),
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(variables.id),
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useDeleteProject() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteProjectAction(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: () => {
      toast.success("Project deleted");
      queryClient.invalidateQueries({
        queryKey: projectKeys.lists(activeOrgId),
      });
      // Surveys might need invalidation if they revert to "no project"
      queryClient.invalidateQueries({
        queryKey: surveyKeys.lists(activeOrgId),
      });
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useAddSurveyToProject() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async ({
      projectId,
      surveyId,
    }: {
      projectId: string;
      surveyId: string;
    }) => {
      const result = await addSurveyToProjectAction(projectId, surveyId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Survey added to project");
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.lists(activeOrgId),
      }); // Update counts
      queryClient.invalidateQueries({
        queryKey: surveyKeys.lists(activeOrgId),
      }); // Update available surveys
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}

export function useRemoveSurveyFromProject() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async ({
      projectId,
      surveyId,
    }: {
      projectId: string;
      surveyId: string;
    }) => {
      const result = await removeSurveyFromProjectAction(projectId, surveyId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Survey removed from project");
      queryClient.invalidateQueries({
        queryKey: projectKeys.detail(variables.projectId),
      });
      queryClient.invalidateQueries({
        queryKey: projectKeys.lists(activeOrgId),
      }); // Update counts
      queryClient.invalidateQueries({
        queryKey: surveyKeys.lists(activeOrgId),
      }); // Update available surveys
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
}
