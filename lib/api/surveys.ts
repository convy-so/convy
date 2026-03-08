/**
 * API functions for survey-related data fetching
 */

export async function fetchSurveys({
  queryKey,
}: {
  queryKey: [string, string, number?, number?, string?, string?];
}) {
  const [, , page, pageSize, search, filter] = queryKey;
  const url = new URL("/api/surveys", window.location.origin);
  if (page) url.searchParams.set("page", page.toString());
  if (pageSize) url.searchParams.set("pageSize", pageSize.toString());
  if (search) url.searchParams.set("search", search);
  if (filter) url.searchParams.set("status", filter);

  const res = await fetch(url.toString(), { credentials: "include" });
  if (!res.ok) throw new Error("Failed to fetch surveys");
  return res.json();
}

export async function fetchSurveyDetails(surveyId: string) {
  const res = await fetch(`/api/surveys/${surveyId}/details`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch survey details");
  return res.json();
}

export async function fetchSurveyResponses(
  surveyId: string,
  page: number,
  limit: number,
  status: string,
) {
  const res = await fetch(
    `/api/surveys/${surveyId}/responses?page=${page}&limit=${limit}&status=${status}`,
    { credentials: "include" },
  );
  if (!res.ok) throw new Error("Failed to fetch responses");
  return res.json();
}

export async function fetchSurveyAnalytics(surveyId: string) {
  const res = await fetch(`/api/surveys/${surveyId}/analytics?format=full`, {
    credentials: "include",
  });
  if (!res.ok) throw new Error("Failed to fetch analytics");
  return res.json();
}

export async function fetchSurveyExtraction(surveyId: string) {
  const res = await fetch(`/api/surveys/${surveyId}/create`);
  if (!res.ok) throw new Error("Failed to fetch extraction data");
  return res.json();
}
