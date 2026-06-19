import { supabase } from "@/integrations/supabase/client";

export const BUCKET = "ssacc-files";

export async function uploadFile(file: File, prefix: string) {
  const path = `${prefix}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: false });
  if (error) throw error;
  return path;
}

export function fileUrl(path: string) {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
}

export async function signedUrl(path: string, expires = 3600) {
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, expires);
  if (error) throw error;
  return data.signedUrl;
}