import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCharacter } from '../contexts/CharacterContext';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { ArrowLeft, Play, Hammer } from 'lucide-react';
import { CharacterData } from '../types/character';

const WorldLauncher: React.FC = () => {
  const { uuid } = useParams<{ uuid: string }>();
  const navigate = useNavigate();
  const { setCharacterData } = useCharacter();
  const [worldCard, setWorldCard] = useState<CharacterData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);

  useEffect(() => {
    const loadWorldCard = async () => {
      if (!uuid) return;
      
      try {
        setLoading(true);
        // Fetch metadata
        const response = await fetch(`/api/character/${uuid}`);
        if (!response.ok) throw new Error('Failed to load world card');
        
        const data = await response.json();
        if (data.success && data.data) {
           // Parse the API response into CharacterData structure
           // The API returns CharacterAPIBase, we might need to map it or use the metadata endpoint
           // Let's try fetching metadata directly by UUID if possible, or mapping
           
           // Actually, let's use the same flow as Gallery: fetch metadata by path or UUID
           // The /api/character/{uuid} endpoint returns the DB model which has extensions_json
           
           const charData = data.data;
           
           // Parse extensions_json if it's a string
           let extensions = charData.extensions_json;
           if (typeof extensions === 'string') {
               try {
                   extensions = JSON.parse(extensions);
               } catch (e) {
                   console.error("Failed to parse extensions_json", e);
                   extensions = {};
               }
           }
           
           // Construct CharacterData object
           const mappedData: CharacterData = {
               spec: "chara_card_v2",
               spec_version: charData.spec_version,
               data: {
                   name: charData.name,
                   description: charData.description,
                   personality: charData.personality,
                   scenario: charData.scenario,
                   first_mes: charData.first_mes,
                   mes_example: charData.mes_example,
                   creator_notes: charData.creator_comment,
                   tags: charData.tags,
                   extensions: extensions,
                   // Add other fields as needed
               }
           };

           setWorldCard(mappedData);

           // Convert to CharacterCard format for Context (Schema mismatch adapter)
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
        }
        
        // Fetch Image
        setImageUrl(`/api/character-image/${uuid}`);

      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unknown error');
      } finally {
        setLoading(false);
      }
    };

    loadWorldCard();
  }, [uuid, setCharacterData]);

  if (loading) return <div className="flex h-full items-center justify-center"><LoadingSpinner text="Loading World..." /></div>;
  if (error) return <div className="flex h-full items-center justify-center text-red-500">Error: {error}</div>;
  if (!worldCard) return <div className="flex h-full items-center justify-center">World not found</div>;

  return (
    <div className="flex flex-col h-full bg-stone-950 text-white p-8 overflow-y-auto">
      <button 
        onClick={() => navigate('/gallery')}
        className="flex items-center text-stone-400 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft className="mr-2" size={20} /> Back to Gallery
      </button>

      <div className="flex flex-col md:flex-row gap-8 max-w-6xl mx-auto w-full">
        {/* Left Column: Image & Stats */}
        <div className="w-full md:w-1/3 flex flex-col gap-4">
          <div className="aspect-[2/3] w-full rounded-xl overflow-hidden shadow-2xl border border-stone-800 bg-stone-900 relative group">
             {imageUrl ? (
                <img 
                  src={imageUrl} 
                  alt={worldCard.data.name} 
                  className="w-full h-full object-cover"
                />
             ) : (
                <div className="w-full h-full flex items-center justify-center text-stone-600">No Image</div>
             )}
             <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-60"></div>
             <div className="absolute bottom-4 left-4 right-4">
                <h1 className="text-3xl font-bold text-white mb-1 drop-shadow-md">{worldCard.data.name}</h1>
                <p className="text-stone-300 text-sm">{worldCard.data.creator}</p>
             </div>
          </div>
          
          <div className="bg-stone-900 p-4 rounded-xl border border-stone-800">
             <h3 className="text-stone-400 text-xs uppercase tracking-wider font-bold mb-3">World Stats</h3>
             
             {/* Calculate stats helper */}
             {(() => {
                const worldData = ((worldCard.data.extensions as any)?.world_data || {}) as any;
                const locations = worldData.locations || {};
                const rooms = worldData.rooms || [];
                const locationCount = Object.keys(locations).length || rooms.length || 0;
                
                const npcCount = Object.keys(locations).length > 0
                    ? Object.values(locations).reduce((acc: number, loc: any) => acc + (loc.npcs?.length || 0), 0)
                    : rooms.reduce((acc: number, room: any) => acc + (room.npcs?.length || 0), 0);
                    
                return (
                 <div className="grid grid-cols-2 gap-4 text-sm">
                    <div>
                       <span className="text-stone-500 block">Locations</span>
                       <span className="text-xl font-mono text-emerald-400">
                         {locationCount}
                       </span>
                    </div>
                    <div>
                       <span className="text-stone-500 block">NPCs</span>
                       <span className="text-xl font-mono text-blue-400">
                          {npcCount}
                       </span>
                    </div>
                 </div>
                );
             })()}
          </div>
        </div>

        {/* Right Column: Actions & Details */}
        <div className="w-full md:w-2/3 flex flex-col gap-6">
           <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {(() => {
                  const worldData = ((worldCard.data.extensions as any)?.world_data || {}) as any;
                  const locationCount = (Object.keys(worldData.locations || {}).length || worldData.rooms?.length || 0);
                  const hasLocations = locationCount > 0;
                  
                  return (
                      <button
                        onClick={() => hasLocations && navigate(`/worldcards/${encodeURIComponent(worldCard.data.name)}/play`)}
                        disabled={!hasLocations}
                        className={`group flex flex-col items-center justify-center p-8 border rounded-xl transition-all shadow-lg 
                            ${hasLocations 
                                ? "bg-gradient-to-br from-emerald-900/50 to-stone-900 border-emerald-800/50 hover:border-emerald-500/50 hover:from-emerald-900/80 hover:shadow-emerald-900/20 cursor-pointer" 
                                : "bg-stone-900/50 border-stone-800 opacity-50 cursor-not-allowed"
                            }`}
                      >
                         <div className={`p-4 rounded-full mb-4 transition-transform ${hasLocations ? "bg-emerald-500/20 group-hover:scale-110" : "bg-stone-800"}`}>
                            <Play size={32} className={hasLocations ? "text-emerald-400" : "text-stone-600"} />
                         </div>
                         <span className={`text-xl font-bold ${hasLocations ? "text-emerald-100" : "text-stone-500"}`}>Play World</span>
                         <span className={`${hasLocations ? "text-emerald-400/60" : "text-stone-600"} text-sm mt-2`}>
                             {hasLocations ? "Enter the simulation" : "No locations to play"}
                         </span>
                      </button>
                  );
              })()}

              <button
                onClick={() => navigate(`/worldcards/${encodeURIComponent(worldCard.data.name)}/builder`)}
                className="group flex flex-col items-center justify-center p-8 bg-gradient-to-br from-blue-900/50 to-stone-900 border border-blue-800/50 rounded-xl hover:border-blue-500/50 hover:from-blue-900/80 transition-all shadow-lg hover:shadow-blue-900/20"
              >
                 <div className="bg-blue-500/20 p-4 rounded-full mb-4 group-hover:scale-110 transition-transform">
                    <Hammer size={32} className="text-blue-400" />
                 </div>
                 <span className="text-xl font-bold text-blue-100">World Builder</span>
                 <span className="text-blue-400/60 text-sm mt-2">Edit rooms, NPCs, and events</span>
              </button>
           </div>

           <div className="bg-stone-900 p-6 rounded-xl border border-stone-800 flex-grow">
              <h2 className="text-xl font-bold text-white mb-4">About this World</h2>
              <p className="text-stone-300 leading-relaxed whitespace-pre-wrap">
                 {worldCard.data.description || "No description provided."}
              </p>
              
              {worldCard.data.scenario && (
                 <div className="mt-6">
                    <h3 className="text-stone-400 text-sm font-bold uppercase tracking-wider mb-2">Scenario</h3>
                    <p className="text-stone-400 italic border-l-2 border-stone-700 pl-4">
                       {worldCard.data.scenario}
                    </p>
                 </div>
              )}
           </div>
        </div>
      </div>
    </div>
  );
};

export default WorldLauncher;
