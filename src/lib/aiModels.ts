import { CHAT_API_URL, readChatError } from "./chatApi";
import { supabase } from "./supabase";

export interface AiModelOption {
  id: string;
  label: string;
}

export interface AiProviderOption {
  id: string;
  label: string;
  models: AiModelOption[];
}

export interface AiModelsResponse {
  default: string;
  providers: AiProviderOption[];
}

export interface AiPreferences {
  default_model: string;
  last_model: string;
}

export function splitModelRef(ref: string): { provider: string; model: string } {
  const index = ref.indexOf(":");
  if (index < 0) return { provider: "", model: "" };
  return { provider: ref.slice(0, index), model: ref.slice(index + 1) };
}

export function findModel(
  data: AiModelsResponse | null,
  ref: string,
): { provider?: AiProviderOption; model?: AiModelOption } {
  if (!data) return {};
  const { provider, model } = splitModelRef(ref);
  const providerOption = data.providers.find((item) => item.id === provider);
  const modelOption = providerOption?.models.find((item) => item.id === model);
  return { provider: providerOption, model: modelOption };
}

export async function fetchAiModels(token: string): Promise<AiModelsResponse> {
  const response = await fetch(`${CHAT_API_URL}/models`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(await readChatError(response));
  return response.json();
}

export async function fetchAiPreferences(): Promise<AiPreferences | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from("user_ai_preferences")
    .select("default_model,last_model")
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function saveAiPreferences(preferences: AiPreferences): Promise<void> {
  if (!supabase) return;
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return;
  const { error } = await supabase.from("user_ai_preferences").upsert({
    user_id: userData.user.id,
    default_model: preferences.default_model,
    last_model: preferences.last_model,
    updated_at: new Date().toISOString(),
  });
  if (error) throw error;
}
