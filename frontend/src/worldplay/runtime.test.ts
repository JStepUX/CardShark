import { buildLocalMapCompanion, buildLocalMapPlayer } from './runtime';
import type { CombatDisplayNPC } from '../types/worldGrid';

describe('buildLocalMapCompanion', () => {
  const roomNpcs: CombatDisplayNPC[] = [
    { id: 'npc-1', name: 'Test NPC', imageUrl: '/img/npc1.png' },
  ];

  it('returns null when no activeNpcId', () => {
    const result = buildLocalMapCompanion(undefined, 'Name', null, roomNpcs, null, 5);
    expect(result).toBeNull();
  });

  it('returns null when no activeNpcCard', () => {
    const result = buildLocalMapCompanion('npc-1', 'Name', null, roomNpcs, null, 5);
    expect(result).toBeNull();
  });

  it('uses player level for companion stats via deriveGridCombatStats', () => {
    const card = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Test', description: '', extensions: {} } } as any;

    const result = buildLocalMapCompanion('npc-1', 'Test NPC', card, roomNpcs, null, 10);

    expect(result).not.toBeNull();
    expect(result!.level).toBe(10);
    // At level 10: hp = 20 + (10 * 5) = 70
    expect(result!.maxHp).toBe(70);
    expect(result!.currentHp).toBe(70);
  });

  it('scales companion HP with player level', () => {
    const card = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Test', description: '', extensions: {} } } as any;

    const lvl1 = buildLocalMapCompanion('npc-1', 'NPC', card, roomNpcs, null, 1);
    const lvl20 = buildLocalMapCompanion('npc-1', 'NPC', card, roomNpcs, null, 20);

    // Level 1: hp = 20 + 5 = 25
    expect(lvl1!.maxHp).toBe(25);
    // Level 20: hp = 20 + 100 = 120
    expect(lvl20!.maxHp).toBe(120);
    // Higher level = more HP
    expect(lvl20!.maxHp).toBeGreaterThan(lvl1!.maxHp);
  });

  it('resolves image from roomNpcs when available', () => {
    const card = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Test', description: '', extensions: {} } } as any;

    const result = buildLocalMapCompanion('npc-1', 'Test', card, roomNpcs, '/fallback.png', 5);
    expect(result!.imagePath).toBe('/img/npc1.png');
  });

  it('falls back to provided image path when NPC not in roomNpcs', () => {
    const card = { spec: 'chara_card_v2', spec_version: '2.0', data: { name: 'Test', description: '', extensions: {} } } as any;

    const result = buildLocalMapCompanion('missing-id', 'Test', card, [], '/fallback.png', 5);
    expect(result!.imagePath).toBe('/fallback.png');
  });
});

describe('buildLocalMapPlayer', () => {
  it('derives stats from level', () => {
    const result = buildLocalMapPlayer({ id: 'p1', name: 'Hero' }, '/img.png', 5);

    expect(result.level).toBe(5);
    // Level 5: hp = 20 + (5 * 5) = 45
    expect(result.maxHp).toBe(45);
    expect(result.currentHp).toBe(45);
  });
});
