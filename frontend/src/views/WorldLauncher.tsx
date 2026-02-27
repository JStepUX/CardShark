import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCharacter } from '../contexts/CharacterContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import Button from '../components/common/Button';
import ImagePreview from '../components/ImagePreview';
import { ArrowLeft, Play, Hammer, Download, Save, Pencil, MapPin, Users, Swords } from 'lucide-react';
import { CharacterData } from '../types/character';
import { htmlToPlainText } from '../utils/contentUtils';
import { worldApi } from '../api/worldApi';
import UserSelect from '../components/UserSelect';
import { UserProfile } from '../types/messages';

interface RoomNPCLike {
   hostile?: boolean;
}

const WorldLauncher: React.FC = () => {
   const { uuid } = useParams<{ uuid: string }>();
   const navigate = useNavigate();
   const { setCharacterData } = useCharacter();
   const [worldCard, setWorldCard] = useState<CharacterData | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [imageUrl, setImageUrl] = useState<string | null>(null);
   const [showUserSelect, setShowUserSelect] = useState(false);

   // Editing state
   const [draftName, setDraftName] = useState('');
   const [draftDesc, setDraftDesc] = useState('');
   const [dirty, setDirty] = useState(false);
   const [saving, setSaving] = useState(false);
   const [editingName, setEditingName] = useState(false);
   const nameInputRef = useRef<HTMLInputElement>(null);

   // Image cache-busting
   const [imageVersion, setImageVersion] = useState(0);

   // Track saved values to compute dirty
   const [savedName, setSavedName] = useState('');
   const [savedDesc, setSavedDesc] = useState('');

   // ── Handlers ──

   const handleUserSelect = useCallback((user: UserProfile) => {
      setShowUserSelect(false);
      navigate(`/world/${uuid}/play`, {
         state: { userProfile: user }
      });
   }, [navigate, uuid]);

   const handlePlayWorld = useCallback(() => {
      setShowUserSelect(true);
   }, []);

   const handleExportWorld = async () => {
      if (!worldCard || !uuid) return;
      try {
         const blob = await worldApi.exportWorld(uuid);
         const url = window.URL.createObjectURL(blob);
         const a = document.createElement('a');
         a.href = url;
         a.download = `${worldCard.data.name}.cardshark.zip`;
         document.body.appendChild(a);
         a.click();
         window.URL.revokeObjectURL(url);
         document.body.removeChild(a);
      } catch (err) {
         console.error('Export failed:', err);
         alert('Failed to export world: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
   };

   const handleSave = async () => {
      if (!uuid || !worldCard || !dirty) return;
      setSaving(true);
      try {
         await worldApi.updateWorld(uuid, {
            name: draftName,
            description: draftDesc,
         });

         const updated = {
            ...worldCard,
            data: { ...worldCard.data, name: draftName, description: draftDesc }
         };
         setWorldCard(updated);
         setSavedName(draftName);
         setSavedDesc(draftDesc);
         setDirty(false);

         setCharacterData((prev: any) => prev ? {
            ...prev,
            name: draftName,
            data: { ...prev.data, name: draftName, description: draftDesc }
         } : prev);
      } catch (err) {
         console.error('Save failed:', err);
         alert('Failed to save: ' + (err instanceof Error ? err.message : 'Unknown error'));
      } finally {
         setSaving(false);
      }
   };

   // ── Image replacement (delegates to ImagePreview) ──

   const handleImageChange = useCallback(async (imageData: string | File) => {
      if (!uuid) return;
      try {
         let file: File;
         if (imageData instanceof File) {
            file = imageData;
         } else {
            const res = await fetch(imageData);
            const blob = await res.blob();
            file = new File([blob], 'world-image.png', { type: 'image/png' });
         }
         await worldApi.updateWorldImage(uuid, file);
         setImageVersion(v => v + 1);
      } catch (err) {
         console.error('Image update failed:', err);
         alert('Failed to update image: ' + (err instanceof Error ? err.message : 'Unknown error'));
      }
   }, [uuid]);

   // ── Inline name editing ──

   const startEditingName = () => {
      setEditingName(true);
      setTimeout(() => nameInputRef.current?.focus(), 0);
   };

   const commitName = () => {
      setEditingName(false);
      const trimmed = draftName.trim();
      if (!trimmed) {
         setDraftName(savedName);
         return;
      }
      setDirty(trimmed !== savedName || draftDesc !== savedDesc);
   };

   const handleNameKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') commitName();
      if (e.key === 'Escape') {
         setDraftName(savedName);
         setEditingName(false);
      }
   };

   // ── Description editing ──

   const handleDescChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const text = e.target.value;
      setDraftDesc(text);
      setDirty(draftName !== savedName || text !== savedDesc);
   };

   // ── Load world card ──

   useEffect(() => {
      const loadWorldCard = async () => {
         if (!uuid) return;

         try {
            setLoading(true);
            const worldCard = await worldApi.getWorld(uuid);

            const mappedData: CharacterData = {
               spec: worldCard.spec,
               spec_version: worldCard.spec_version,
               data: {
                  name: worldCard.data.name,
                  description: worldCard.data.description,
                  personality: worldCard.data.personality,
                  scenario: worldCard.data.scenario,
                  first_mes: worldCard.data.first_mes,
                  mes_example: worldCard.data.mes_example,
                  creator_notes: worldCard.data.creator_notes,
                  tags: worldCard.data.tags,
                  extensions: worldCard.data.extensions as unknown as CharacterData['data']['extensions'],
                  character_uuid: uuid,
                  creator: worldCard.data.creator,
               }
            };

            setWorldCard(mappedData);

            const plainDesc = htmlToPlainText(mappedData.data.description || '');
            setDraftName(mappedData.data.name);
            setDraftDesc(plainDesc);
            setSavedName(mappedData.data.name);
            setSavedDesc(plainDesc);

            const contextData = {
               name: mappedData.data.name,
               description: mappedData.data.description || '',
               personality: mappedData.data.personality || '',
               scenario: mappedData.data.scenario || '',
               first_mes: mappedData.data.first_mes || '',
               mes_example: mappedData.data.mes_example || '',
               creatorcomment: mappedData.data.creator_notes || '',
               avatar: 'none',
               chat: '',
               talkativeness: '0.5',
               fav: false,
               tags: mappedData.data.tags || [],
               spec: mappedData.spec,
               spec_version: mappedData.spec_version || '2.0',
               data: mappedData.data,
               create_date: new Date().toISOString()
            };
            setCharacterData(contextData as any);
            setImageUrl(worldApi.getWorldImageUrl(uuid));

         } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error');
         } finally {
            setLoading(false);
         }
      };

      loadWorldCard();
   }, [uuid, setCharacterData]);

   // ── Loading / Error states ──

   if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner text="Loading World..." /></div>;
   if (error) return <div className="flex h-full items-center justify-center text-red-500">Error: {error}</div>;
   if (!worldCard) return <div className="flex h-full items-center justify-center">World not found</div>;

   // ── Computed values ──

   const resolvedImageUrl = imageUrl ? `${imageUrl}?v=${imageVersion}` : null;

   const worldData = ((worldCard.data.extensions as any)?.world_data || {}) as any;
   const rooms: any[] = worldData.rooms || [];
   const locationCount = rooms.length;

   let friendlyCount = 0;
   let hostileCount = 0;
   for (const room of rooms) {
      const npcs: RoomNPCLike[] = room.instance_npcs || [];
      for (const npc of npcs) {
         if (npc.hostile) hostileCount++;
         else friendlyCount++;
      }
   }

   const hasLocations = locationCount > 0;

   // ── Render ──

   return (
      <div className="flex flex-col h-full bg-stone-950 text-white overflow-y-auto">

         {/* ─── Header bar ─── */}
         <div className="flex justify-between items-center px-8 pt-6 pb-2">
            <button
               onClick={() => navigate('/gallery')}
               className="flex items-center gap-2 text-stone-400 hover:text-white transition-colors text-sm"
            >
               <ArrowLeft size={16} />
               Gallery
            </button>

            <div className="flex items-center gap-3">
               {dirty && (
                  <Button
                     variant="primary"
                     icon={saving ? undefined : <Save size={16} />}
                     onClick={handleSave}
                     disabled={saving}
                     className="!bg-emerald-600 hover:!bg-emerald-500 !text-white text-sm"
                  >
                     {saving ? 'Saving...' : 'Save'}
                  </Button>
               )}
               <button
                  onClick={handleExportWorld}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg border border-stone-700 text-stone-300 hover:text-white hover:border-stone-500 transition-all text-sm"
               >
                  <Download size={16} />
                  Export
               </button>
            </div>
         </div>

         {/* ─── Main content ─── */}
         <div className="flex-1 flex flex-col items-center px-8 pb-12">
            <div className="w-full max-w-4xl">

               {/* ─── Hero: Cover image + Info ─── */}
               <div className="flex gap-10 mt-6 mb-10">

                  {/* Cover image — delegates upload/crop to ImagePreview */}
                  <div className="w-72 flex-shrink-0">
                     <div className="aspect-[3/4] rounded-xl overflow-hidden border border-stone-800">
                        <ImagePreview
                           imageUrl={resolvedImageUrl || undefined}
                           onImageChange={handleImageChange}
                        />
                     </div>
                  </div>

                  {/* Info column */}
                  <div className="flex-1 flex flex-col pt-1">

                     {/* Editable title (h1 styled by global base) */}
                     <div className="group/name mb-5">
                        {editingName ? (
                           <input
                              ref={nameInputRef}
                              type="text"
                              value={draftName}
                              onChange={e => setDraftName(e.target.value)}
                              onBlur={commitName}
                              onKeyDown={handleNameKeyDown}
                              className="w-full text-4xl bg-transparent border-b-2 border-emerald-500 text-white outline-none pb-1"
                              maxLength={100}
                           />
                        ) : (
                           <h1
                              className="text-4xl cursor-text flex items-center gap-3 hover:text-stone-100 transition-colors"
                              onClick={startEditingName}
                           >
                              {draftName}
                              <Pencil size={14} className="text-stone-700 opacity-0 group-hover/name:opacity-100 transition-opacity" />
                           </h1>
                        )}
                     </div>

                     {/* Description label (h3 base + page-specific overrides) */}
                     <h3 className="text-xs uppercase tracking-widest text-stone-500 mb-3">Description</h3>

                     {/* Editable description (styled as plain text) */}
                     <textarea
                        value={draftDesc}
                        onChange={handleDescChange}
                        className="w-full bg-transparent resize-none text-stone-400 leading-relaxed outline-none placeholder:text-stone-700 flex-1 min-h-[80px]"
                        placeholder="Describe your world..."
                        rows={4}
                     />

                     {/* Stat pills */}
                     <div className="flex gap-3 mt-auto pt-4">
                        <div className="flex items-center gap-2 bg-stone-800/40 border border-stone-700/40 rounded-full px-4 py-2">
                           <MapPin size={15} className="text-stone-400" />
                           <span className="text-white font-bold text-sm">{locationCount}</span>
                           <span className="text-stone-500 text-sm">Locations</span>
                        </div>
                        <div className="flex items-center gap-2 bg-stone-800/40 border border-stone-700/40 rounded-full px-4 py-2">
                           <Users size={15} className="text-amber-500" />
                           <span className="text-white font-bold text-sm">{friendlyCount}</span>
                           <span className="text-stone-500 text-sm">Friendly</span>
                        </div>
                        <div className="flex items-center gap-2 bg-stone-800/40 border border-stone-700/40 rounded-full px-4 py-2">
                           <Swords size={15} className="text-violet-400" />
                           <span className="text-white font-bold text-sm">{hostileCount}</span>
                           <span className="text-stone-500 text-sm">Hostile</span>
                        </div>
                     </div>
                  </div>
               </div>

               {/* ─── Action cards ─── */}
               <div className="grid grid-cols-2 gap-5">

                  {/* World Builder */}
                  <button
                     onClick={() => navigate(`/world/${uuid}/builder`)}
                     className="group relative flex flex-col items-center justify-center py-10 rounded-xl border border-emerald-800/30 bg-stone-900/50 hover:border-emerald-600/50 transition-all cursor-pointer overflow-hidden"
                  >
                     <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-emerald-500/0 group-hover:from-emerald-500/10 transition-all duration-300 pointer-events-none" />
                     <div className="bg-emerald-900/50 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform relative">
                        <Hammer size={28} className="text-emerald-400" />
                     </div>
                     <span className="text-lg font-bold text-white relative">World Builder</span>
                     <span className="text-stone-500 text-sm mt-1 relative">Edit rooms, NPCs, and events</span>
                  </button>

                  {/* Play World */}
                  <button
                     onClick={() => hasLocations && handlePlayWorld()}
                     disabled={!hasLocations}
                     className={`group relative flex flex-col items-center justify-center py-10 rounded-xl border transition-all overflow-hidden
                        ${hasLocations
                           ? 'border-blue-800/30 bg-stone-900/50 hover:border-blue-600/50 cursor-pointer'
                           : 'border-stone-800/50 bg-stone-900/30 opacity-50 cursor-not-allowed'
                        }`}
                  >
                     {hasLocations && (
                        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-blue-500/0 group-hover:from-blue-500/10 transition-all duration-300 pointer-events-none" />
                     )}
                     <div className={`p-4 rounded-full mb-4 transition-transform relative ${hasLocations ? 'bg-blue-900/50 group-hover:scale-110' : 'bg-stone-800/50'}`}>
                        <Play size={28} className={hasLocations ? 'text-blue-400' : 'text-stone-600'} />
                     </div>
                     <span className={`text-lg font-bold relative ${hasLocations ? 'text-white' : 'text-stone-500'}`}>
                        Play World
                     </span>
                     <span className={`text-sm mt-1 relative ${hasLocations ? 'text-stone-500' : 'text-stone-600'}`}>
                        {hasLocations ? `${locationCount} locations ready` : 'No locations to play'}
                     </span>
                  </button>
               </div>
            </div>
         </div>

         {/* ─── Modals ─── */}
         <UserSelect
            isOpen={showUserSelect}
            onClose={() => setShowUserSelect(false)}
            onSelect={handleUserSelect}
         />
      </div>
   );
};

export default WorldLauncher;
