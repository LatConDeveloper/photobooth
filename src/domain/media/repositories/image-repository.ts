import type { SupabaseClient } from '@supabase/supabase-js';

export type PhotoRow = {
  id: string;
  device_token: string | null;
  link_id: string | null;
  storage_path: string;
  created_at: string;
};

export class ImageRepository {
  constructor(private supabase: SupabaseClient) {}

  async insert(deviceToken: string, storagePath: string){
    const { data, error } = await this.supabase
      .from('photos')
      .insert({ device_token: deviceToken, storage_path: storagePath })
      .select('*')
      .single();
    if (error) throw error;
    return data as PhotoRow;
  }

  async getPathsByDeviceToken(deviceToken: string){
    const { data, error } = await this.supabase
      .from('photos')
      .select('storage_path')
      .eq('device_token', deviceToken)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => r.storage_path);
  }

  async createLink(deviceToken: string, expiresAt?: string) {
    const { data, error } = await this.supabase
      .from('photo_links')
      .insert({ device_token: deviceToken, expires_at: expiresAt || null })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async insertWithLink(linkId: string, storagePath: string){
    const { data, error } = await this.supabase
      .from('photos')
      .insert({ link_id: linkId, storage_path: storagePath })
      .select('*')
      .single();
    if (error) throw error;
    return data;
  }

  async getPathsByLinkId(linkId: string){
    const { data, error } = await this.supabase
      .from('photos')
      .select('storage_path')
      .eq('link_id', linkId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return (data || []).map(r => r.storage_path);
  }
}