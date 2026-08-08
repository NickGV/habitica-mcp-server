// Zod argument validation for every advertised MCP tool.
//
// Each schema mirrors the tool's advertised `inputSchema`: same property
// types, same enums, same required/optional fields. Unknown keys are
// stripped (zod's default object behavior) so previously accepted calls
// keep working — no .strict()/.passthrough() and no .coerce()/.transform()
// anywhere: invalid values are rejected outright, never clamped.
import { z } from 'zod';
import { t } from './i18n.js';

// Numeric enums shared by `difficulty` and `priority`.
const numericLevels = { EASY: 0.1, MEDIUM: 1, HARD: 1.5, VERY_HARD: 2 };
const numberEnum = z.nativeEnum(numericLevels);

const habitTypes = z.enum(['habits', 'dailys', 'todos', 'rewards']);
const taskTypes = z.enum(['habit', 'daily', 'todo', 'reward']);
const directions = z.enum(['up', 'down']);
const equipTypes = z.enum(['mount', 'pet', 'costume', 'equipped']);
const shopTypes = z.enum(['market', 'questShop', 'timeTravelersShop', 'seasonalShop']);

const checklistItem = z.object({
  text: z.string(),
  completed: z.boolean().optional(),
});

const checklistArray = z.array(checklistItem).optional();

export const toolSchemas = {
  get_user_profile: z.object({}),
  get_tasks: z.object({
    type: habitTypes.optional(),
  }),
  create_task: z.object({
    type: taskTypes,
    text: z.string(),
    notes: z.string().optional(),
    difficulty: numberEnum.optional(),
    priority: numberEnum.optional(),
    checklist: checklistArray,
  }),
  score_task: z.object({
    taskId: z.string(),
    direction: directions.optional(),
  }),
  update_task: z.object({
    taskId: z.string(),
    text: z.string().optional(),
    notes: z.string().optional(),
    completed: z.boolean().optional(),
  }),
  delete_task: z.object({
    taskId: z.string(),
  }),
  get_stats: z.object({}),

  buy_reward: z.object({
    key: z.string(),
  }),
  get_inventory: z.object({}),

  get_tags: z.object({}),
  create_tag: z.object({
    name: z.string(),
  }),

  get_pets: z.object({}),
  feed_pet: z.object({
    pet: z.string(),
    food: z.string(),
  }),
  hatch_pet: z.object({
    egg: z.string(),
    hatchingPotion: z.string(),
  }),

  get_mounts: z.object({}),
  equip_item: z.object({
    type: equipTypes,
    key: z.string(),
  }),

  get_notifications: z.object({}),
  read_notification: z.object({
    notificationId: z.string(),
  }),

  get_shop: z.object({
    shopType: shopTypes.optional(),
  }),
  buy_item: z.object({
    itemKey: z.string(),
    quantity: z.number().optional(),
  }),

  cast_spell: z.object({
    spellId: z.string(),
    targetId: z.string().optional(),
  }),

  add_checklist_item: z.object({
    taskId: z.string(),
    text: z.string(),
  }),
  update_checklist_item: z.object({
    taskId: z.string(),
    itemId: z.string(),
    text: z.string().optional(),
    completed: z.boolean().optional(),
  }),
  delete_checklist_item: z.object({
    taskId: z.string(),
    itemId: z.string(),
  }),
  get_task_checklist: z.object({
    taskId: z.string(),
  }),
  score_checklist_item: z.object({
    taskId: z.string(),
    itemId: z.string(),
  }),
};

// Formats the first validation issue as "field: message" so an agent can
// correct the call. `path` names the failing field; zod messages already
// include the received value ("expected X, received Y").
function formatIssue(issue) {
  const field = issue.path.length > 0 ? issue.path.join('.') : '(root)';
  return `${field}: ${issue.message}`;
}

// Validates tool arguments against the schema for `name`.
// Returns { ok: true, data } with unknown keys stripped, or
// { ok: false, message } with a bilingual, actionable error.
export function validateArgs(name, args) {
  const schema = toolSchemas[name];
  if (!schema) {
    return { ok: true, data: args ?? {} };
  }

  const result = schema.safeParse(args ?? {});
  if (result.success) {
    return { ok: true, data: result.data };
  }

  const issue = formatIssue(result.error.issues[0]);
  return {
    ok: false,
    message: t(
      `Invalid arguments for tool "${name}": ${issue}`,
      `工具 "${name}" 参数无效: ${issue}`
    ),
  };
}