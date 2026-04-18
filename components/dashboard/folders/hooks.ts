"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import {
  getFoldersAction,
  getFolderAction,
  createFolderAction,
  updateFolderAction,
  deleteFolderAction,
  addSurveyToFolderAction,
  removeSurveyFromFolderAction,
} from "@/app/actions/folder";
import { getSurveysAction } from "@/app/actions/survey";
import { useAuth } from "@/components/providers/auth-provider";

type FolderResponse = Awaited<ReturnType<typeof getFoldersAction>>;
type FolderList = Extract<FolderResponse, { success: true }>["data"];
type FolderListItem = FolderList extends Array<infer T> ? T : never;

// Keys
export const folderKeys = {
  all: (orgId?: string | null) => ["folders", orgId] as const,
  lists: (orgId?: string | null) =>
    [...folderKeys.all(orgId), "list"] as const,
  detail: (id: string) => ["folders", "detail", id] as const,
};

export const surveyKeys = {
  all: (orgId?: string | null) => ["surveys", orgId] as const,
  lists: (orgId?: string | null) => [...surveyKeys.all(orgId), "list"] as const,
};

// Queries
export function useFolders() {
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useQuery({
    queryKey: folderKeys.lists(activeOrgId),
    queryFn: async () => {
      const result = await getFoldersAction();
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
  });
}

export function useFolder(id: string) {
  return useQuery({
    queryKey: folderKeys.detail(id),
    queryFn: async () => {
      const result = await getFolderAction(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    enabled: !!id,
  });
}

// Helper query to get surveys available for assignment (no folder)
export function useAvailableSurveys() {
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useQuery({
    queryKey: surveyKeys.lists(activeOrgId),
    queryFn: async () => {
      const result = await getSurveysAction();
      if (!result.success) throw new Error(result.error);
      // Filter client-side for simplicity, or backend action could optionally filter
      return result.data.filter((s) => !s.folderId);
    },
  });
}

// Mutations
export function useCreateFolder() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async (data: {
      name: string;
      description?: string;
      color?: string;
    }) => {
      const result = await createFolderAction(data);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (newFolder) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({
        queryKey: folderKeys.lists(activeOrgId),
      });

      // Snapshot the previous value
      const previousFolders = queryClient.getQueryData(
        folderKeys.lists(activeOrgId),
      );

      // Optimistically update to the new value
      queryClient.setQueryData(folderKeys.lists(activeOrgId), (old: Record<string, unknown>[] | undefined) => [
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
        folderKeys.lists(activeOrgId),
        context?.previousFolders,
      );
    },
    onSettled: () => {
      // Always refetch after error or success to ensure sync
      queryClient.invalidateQueries({
        queryKey: folderKeys.lists(activeOrgId),
      });
    },
  });
}

export function useUpdateFolder() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async (data: {
      id: string;
      name?: string;
      description?: string;
    }) => {
      const result = await updateFolderAction(data);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (updatedFolder) => {
      await queryClient.cancelQueries({
        queryKey: folderKeys.lists(activeOrgId),
      });
      await queryClient.cancelQueries({
        queryKey: folderKeys.detail(updatedFolder.id),
      });

      const previousFolders = queryClient.getQueryData(
        folderKeys.lists(activeOrgId),
      );
      const previousFolder = queryClient.getQueryData(
        folderKeys.detail(updatedFolder.id),
      );

      queryClient.setQueryData(folderKeys.lists(activeOrgId), (old: FolderList | undefined) =>
        old?.map((p: FolderListItem) =>
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
        folderKeys.lists(activeOrgId),
        context?.previousFolders,
      );
      queryClient.setQueryData(
        folderKeys.detail(updatedFolder.id),
        context?.previousFolder,
      );
    },
    onSettled: (_, __, variables) => {
      queryClient.invalidateQueries({
        queryKey: folderKeys.lists(activeOrgId),
      });
      queryClient.invalidateQueries({
        queryKey: folderKeys.detail(variables.id),
      });
    },
  });
}

export function useDeleteFolder() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async (id: string) => {
      const result = await deleteFolderAction(id);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({
        queryKey: folderKeys.lists(activeOrgId),
      });

      const previousFolders = queryClient.getQueryData(
        folderKeys.lists(activeOrgId),
      );

      queryClient.setQueryData(folderKeys.lists(activeOrgId), (old: FolderList | undefined) =>
        old?.filter((p: FolderListItem) => p.id !== id),
      );

      return { previousFolders };
    },
    onSuccess: () => {
      toast.success("Folder deleted");
    },
    onError: (err, _, context: { previousFolders?: unknown } | undefined) => {
      toast.error(err.message);
      queryClient.setQueryData(
        folderKeys.lists(activeOrgId),
        context?.previousFolders,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: folderKeys.lists(activeOrgId),
      });
      queryClient.invalidateQueries({
        queryKey: surveyKeys.lists(activeOrgId),
      });
    },
  });
}

export function useAddSurveyToFolder() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async ({
      folderId,
      surveyId,
    }: {
      folderId: string;
      surveyId: string;
    }) => {
      const result = await addSurveyToFolderAction(folderId, surveyId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Survey added to folder");
      queryClient.invalidateQueries({
        queryKey: folderKeys.detail(variables.folderId),
      });
      queryClient.invalidateQueries({
        queryKey: folderKeys.lists(activeOrgId),
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

export function useRemoveSurveyFromFolder() {
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const activeOrgId = session?.activeOrganizationId || null;

  return useMutation({
    mutationFn: async ({
      folderId,
      surveyId,
    }: {
      folderId: string;
      surveyId: string;
    }) => {
      const result = await removeSurveyFromFolderAction(folderId, surveyId);
      if (!result.success) throw new Error(result.error);
      return result.data;
    },
    onSuccess: (_, variables) => {
      toast.success("Survey removed from folder");
      queryClient.invalidateQueries({
        queryKey: folderKeys.detail(variables.folderId),
      });
      queryClient.invalidateQueries({
        queryKey: folderKeys.lists(activeOrgId),
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


