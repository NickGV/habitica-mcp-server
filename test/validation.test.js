import { describe, it, expect, beforeEach } from 'vitest';
import { setLanguage } from '../i18n.js';
import { toolSchemas, validateArgs } from '../validation.js';

// The 26 tool names advertised by the server (ListTools contract).
const TOOL_NAMES = [
  'get_user_profile',
  'get_tasks',
  'create_task',
  'score_task',
  'update_task',
  'delete_task',
  'get_stats',
  'buy_reward',
  'get_inventory',
  'cast_spell',
  'get_tags',
  'create_tag',
  'get_pets',
  'feed_pet',
  'hatch_pet',
  'get_mounts',
  'equip_item',
  'get_notifications',
  'read_notification',
  'get_shop',
  'buy_item',
  'add_checklist_item',
  'update_checklist_item',
  'delete_checklist_item',
  'get_task_checklist',
  'score_checklist_item',
];

describe('toolSchemas', () => {
  it('registers a schema for every advertised tool (26)', () => {
    expect(Object.keys(toolSchemas)).toHaveLength(26);
    for (const name of TOOL_NAMES) {
      expect(toolSchemas, `missing schema for ${name}`).toHaveProperty(name);
    }
  });
});

describe('validateArgs', () => {
  beforeEach(() => {
    setLanguage('en');
  });

  it('strips unknown keys instead of rejecting (extra "tags" ignored)', () => {
    const result = validateArgs('create_task', {
      type: 'todo',
      text: 'Buy milk',
      tags: ['shopping'],
    });
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({ type: 'todo', text: 'Buy milk' });
  });

  it('rejects out-of-enum difficulty rather than clamping it', () => {
    const result = validateArgs('create_task', { type: 'todo', text: 'x', difficulty: 3 });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('create_task');
    expect(result.message).toContain('difficulty');
  });

  it('rejects a string quantity instead of coercing to number', () => {
    const result = validateArgs('buy_item', { itemKey: 'potion', quantity: '2' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('quantity');
  });

  it('names the missing field for a required-field failure', () => {
    const result = validateArgs('add_checklist_item', { taskId: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('text');
  });

  it('accepts a no-arguments tool with no arguments at all', () => {
    const result = validateArgs('get_user_profile', undefined);
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({});
  });

  it('accepts valid arguments with optional fields omitted', () => {
    const result = validateArgs('get_shop', {});
    expect(result.ok).toBe(true);
    expect(result.data).toEqual({});
  });

  it('rejects an invalid direction on score_task', () => {
    const result = validateArgs('score_task', { taskId: 'abc', direction: 'sideways' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('direction');
  });

  it('rejects an invalid get_tasks type', () => {
    const result = validateArgs('get_tasks', { type: 'bogus' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('type');
  });

  it('accepts checklist arrays with required item text', () => {
    const result = validateArgs('create_task', {
      type: 'daily',
      text: 'Plan',
      checklist: [{ text: 'Step one' }],
    });
    expect(result.ok).toBe(true);
    expect(result.data.checklist).toEqual([{ text: 'Step one' }]);
  });

  it('produces Chinese validation messages under zh-CN locale', () => {
    setLanguage('zh-CN');
    const result = validateArgs('buy_item', { itemKey: 'potion', quantity: '2' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('工具 "buy_item" 参数无效');
  });

  it('falls back to English for unsupported locales', () => {
    setLanguage('ja');
    const result = validateArgs('add_checklist_item', { taskId: 'abc' });
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Invalid arguments for tool "add_checklist_item"');
  });
});