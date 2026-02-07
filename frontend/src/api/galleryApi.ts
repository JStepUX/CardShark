/**
 * @file galleryApi.ts
 * @description API client for gallery folder management.
 */

export async function updateCardFolder(uuid: string, folderName: string | null): Promise<void> {
  const response = await fetch(`/api/character/${encodeURIComponent(uuid)}/folder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folder_name: folderName }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(err.detail || err.message || 'Failed to update folder');
  }
}

export async function bulkUpdateFolder(uuids: string[], folderName: string | null): Promise<{ updated: number; total: number }> {
  const response = await fetch('/api/characters/bulk-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ uuids, folder_name: folderName }),
  });
  if (!response.ok) {
    const err = await response.json().catch(() => ({ message: `HTTP ${response.status}` }));
    throw new Error(err.detail || err.message || 'Failed to bulk update folders');
  }
  const data = await response.json();
  return { updated: data.data.updated, total: data.data.total };
}
