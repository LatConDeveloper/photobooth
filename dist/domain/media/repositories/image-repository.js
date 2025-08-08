export class ImageRepository {
    supabase;
    constructor(supabase) {
        this.supabase = supabase;
    }
    async insert(deviceToken, storagePath) {
        const { data, error } = await this.supabase
            .from('photos')
            .insert({ device_token: deviceToken, storage_path: storagePath })
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    async getPathsByDeviceToken(deviceToken) {
        const { data, error } = await this.supabase
            .from('photos')
            .select('storage_path')
            .eq('device_token', deviceToken)
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        return (data || []).map(r => r.storage_path);
    }
    async createLink(deviceToken, method, destination, expiresAt) {
        const { data, error } = await this.supabase
            .from('photo_links')
            .insert({ device_token: deviceToken, expires_at: expiresAt || null, method, destination })
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    async getPhotoLinkByDeviceToken(deviceToken) {
        const { data, error } = await this.supabase
            .from('photo_links')
            .select('*')
            .eq('device_token', deviceToken)
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        return data[0];
    }
    async insertWithLink(linkId, storagePath) {
        const { data, error } = await this.supabase
            .from('photos')
            .insert({ link_id: linkId, storage_path: storagePath })
            .select('*')
            .single();
        if (error)
            throw error;
        return data;
    }
    async getPathsByLinkId(linkId) {
        const { data, error } = await this.supabase
            .from('photos')
            .select('storage_path')
            .eq('link_id', linkId)
            .order('created_at', { ascending: true });
        if (error)
            throw error;
        return (data || []).map(r => r.storage_path);
    }
}
