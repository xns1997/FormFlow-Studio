import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { exportToComponentNodes } from '../designer/export';
import { executeFormControlEvent } from '../services/engine/formEventExecutor';
import { collectFlowSideEffects } from '../services/engine/flowSideEffects';
import { applyPreviewFlowSideEffects } from '../services/io/projectWriteBack';
import { importFormFlowPackage } from './packageManager';
import type { ProjectStructure } from './types';

const FIXTURE_URL = new URL('./fixtures/game-data-product.formflow', import.meta.url);
let fixturePromise: Promise<ProjectStructure> | undefined;

function project() {
  fixturePromise ||= (async () => {
    const bytes = await readFile(FIXTURE_URL);
    const source = await importFormFlowPackage(new File([bytes], 'game-data-product.formflow'));
    assert.ok(source, 'invalid game-data-product.formflow fixture');
    return source;
  })();
  return fixturePromise;
}

async function click(source: ProjectStructure, formId: string, componentId: string, values: Record<string, unknown>) {
  const form = source.forms.find((item) => item.id === formId);
  assert.ok(form, `missing form ${formId}`);
  const components = exportToComponentNodes(form.design.components);
  const component = components.find((item) => item.id === componentId);
  assert.ok(component, `missing component ${componentId}`);
  const updatedValues: Record<string, unknown> = {};
  const result = await executeFormControlEvent({
    eventName: 'onClick',
    field: component.name,
    values,
    originalValues: {},
    component,
  }, {
    workflows: source.workflows,
    tables: source.srcTable,
    components,
    setValue: (field, value) => { updatedValues[field] = value; },
    setVisible: () => {},
    setDisabled: () => {},
    setRequired: () => {},
    showMessage: () => {},
    trigger: component.props.flowTriggers?.onClick,
  });
  const effects = result.flowResults.flatMap((item) => collectFlowSideEffects(item));
  return { result, effects, updatedValues, project: applyPreviewFlowSideEffects(source, effects).project };
}

test('game data product saves all three business forms through executable workflows', async () => {
  const source = await project();

  const eventId = 'EVT-20260716-999901';
  const event = await click(source, 'event-entry', 'event-save', {
    event_id: eventId,
    player_id: 'P000001',
    event_time: '2026-07-16 10:00:00',
    event_type: '关卡完成',
    session_id: 'SES-999901',
    level_id: 'L10',
    level_result: '完成',
    duration_seconds: 120,
    version: '1.3.0',
    channel: '应用商店',
    device_os: 'iOS',
  });
  assert.equal(event.result.flowExecuted, true);
  assert.equal(event.result.error, undefined);
  assert.equal(event.result.flowResults[0]?.success, true);
  assert.equal(event.updatedValues.event_status, '玩家事件已保存', JSON.stringify(event.result.flowResults[0]?.finalOutputs));
  assert.equal(event.project.srcTable.find((item) => item.id === 'player_events')?.sheets[0].preview.some((row) => row.event_id === eventId), true);

  const orderId = 'ORD-20260716-999901';
  const order = await click(event.project, 'payment-entry', 'order-save', {
    order_id: orderId,
    player_id: 'P000001',
    order_time: '2026-07-16 10:10:00',
    product_type: '礼包',
    product_name: '验收礼包',
    amount: 30,
    currency: 'CNY',
    payment_status: '已支付',
    is_first_purchase: false,
    channel: '应用商店',
    version: '1.3.0',
  });
  assert.equal(order.result.flowExecuted, true);
  assert.equal(order.result.error, undefined);
  assert.equal(order.result.flowResults[0]?.success, true);
  assert.equal(order.updatedValues.payment_status_text, '付费订单已保存');
  assert.equal(order.project.srcTable.find((item) => item.id === 'payment_orders')?.sheets[0].preview.some((row) => row.order_id === orderId), true);

  const campaignId = 'CMP-202607-901';
  const campaign = await click(order.project, 'campaign-entry', 'campaign-save', {
    campaign_id: campaignId,
    campaign_name: '验收活动',
    campaign_type: '社区挑战',
    status: '草稿',
    start_date: '2026-07-16',
    end_date: '2026-07-22',
    target_channel: '社区合作',
    target_version: '1.3.0',
    budget: 10000,
    target_new_players: 100,
    target_revenue: 15000,
  });
  assert.equal(campaign.result.flowExecuted, true);
  assert.equal(campaign.result.error, undefined);
  assert.equal(campaign.result.flowResults[0]?.success, true);
  assert.equal(campaign.updatedValues.campaign_status_text, '活动配置已保存');
  assert.equal(campaign.project.srcTable.find((item) => item.id === 'campaigns')?.sheets[0].preview.some((row) => row.campaign_id === campaignId), true);
});

test('completed game package writes the campaign workflow export back to the status control', async () => {
  const source = await project();
  const campaign = await click(source, 'campaign-entry', 'campaign-save', {
    campaign_id: 'CMP-202607-903',
    campaign_name: '流程出口回归活动',
    campaign_type: '社区挑战',
    start_date: '2026-07-16',
    end_date: '2026-07-22',
    target_channel: '社区合作',
    target_version: '1.3.0',
    budget: 10000,
    target_new_players: 100,
    target_revenue: 15000,
    status: '草稿',
  });
  assert.equal(campaign.result.error, undefined);
  assert.equal(campaign.result.flowResults[0]?.success, true);
  assert.equal(campaign.updatedValues.campaign_status_text, '活动配置已保存');
});

test('game data product rejects missing required fields without a write-back effect', async () => {
  const source = await project();
  const before = source.srcTable.find((item) => item.id === 'player_events')?.sheets[0].preview.length;
  const failed = await click(source, 'event-entry', 'event-save', {
    event_id: '',
    player_id: 'P000001',
    event_time: '2026-07-16 10:00:00',
    event_type: '登录',
    duration_seconds: 0,
    version: '1.3.0',
    channel: '应用商店',
    device_os: 'iOS',
  });
  assert.equal(failed.result.flowExecuted, true);
  assert.equal(failed.result.error, undefined);
  assert.equal(failed.result.flowResults[0]?.success, true);
  assert.equal(failed.effects.some((effect) => effect.kind === 'upsert-table-row'), false);
  assert.equal(failed.project.srcTable.find((item) => item.id === 'player_events')?.sheets[0].preview.length, before);
});

test('game data product rejects duplicate, foreign-key, boundary, conditional and protected-update failures', async () => {
  const source = await project();
  const existingEvent = source.srcTable.find((item) => item.id === 'player_events')!.sheets[0].preview[0];
  const existingCampaign = source.srcTable.find((item) => item.id === 'campaigns')!.sheets[0].preview.find((row) => row.status === '已结束')!;
  const validEvent = {
    event_id: 'EVT-20260716-999902', player_id: 'P000001', event_time: '2026-07-16 10:00:00', event_type: '登录',
    duration_seconds: 120, version: '1.3.0', channel: '应用商店', device_os: 'iOS',
  };
  const validOrder = {
    order_id: 'ORD-20260716-999902', player_id: 'P000001', order_time: '2026-07-16 10:10:00', product_type: '礼包',
    product_name: '验收礼包', amount: 30, currency: 'CNY', payment_status: '已支付', channel: '应用商店', version: '1.3.0',
  };
  const validCampaign = {
    campaign_id: 'CMP-202607-902', campaign_name: '验收活动', campaign_type: '社区挑战', status: '草稿',
    start_date: '2026-07-16', end_date: '2026-07-22', target_channel: '社区合作', target_version: '1.3.0',
    budget: 10000, target_new_players: 100, target_revenue: 15000,
  };
  const failures = [
    ['event-entry', 'event-save', { ...validEvent, event_id: existingEvent.event_id }],
    ['event-entry', 'event-save', { ...validEvent, player_id: 'P999999' }],
    ['event-entry', 'event-save', { ...validEvent, duration_seconds: 14401 }],
    ['event-entry', 'event-save', { ...validEvent, event_type: '关卡失败', level_id: '', level_result: '' }],
    ['payment-entry', 'order-save', { ...validOrder, amount: 0 }],
    ['payment-entry', 'order-save', { ...validOrder, payment_status: '退款', original_order_id: '' }],
    ['campaign-entry', 'campaign-save', { ...validCampaign, start_date: '2026-07-22', end_date: '2026-07-16' }],
    ['campaign-entry', 'campaign-save', { ...validCampaign, budget: -1 }],
    ['campaign-entry', 'campaign-save', { ...existingCampaign, start_date: '2026-07-14', end_date: '2026-07-15' }],
  ] as const;
  for (const [formId, componentId, values] of failures) {
    const failed = await click(source, formId, componentId, values);
    assert.equal(failed.result.error, undefined, `${formId} should finish with a validation result`);
    assert.equal(failed.effects.some((effect) => effect.kind === 'upsert-table-row'), false, `${formId} must not write invalid data`);
  }
});

test('game data product analysis and forecast workflows execute to their export nodes', async () => {
  const source = await project();
  const analysis = await click(source, 'game-dashboard', 'dashboard-analyze', { trigger: true });
  assert.equal(analysis.result.flowExecuted, true);
  assert.equal(analysis.result.error, undefined);
  assert.equal(analysis.result.flowResults[0]?.success, true);
  assert.equal(typeof analysis.updatedValues.kpi_dau, 'number', JSON.stringify(analysis.result.flowResults[0]?.finalOutputs));
  assert.match(String(analysis.updatedValues.dashboard_status), /指标分析已完成并刷新看板/);

  const forecast = await click(source, 'game-dashboard', 'dashboard-forecast', { trigger: true });
  assert.equal(forecast.result.flowExecuted, true);
  assert.equal(forecast.result.error, undefined);
  assert.equal(forecast.result.flowResults[0]?.success, true);
  assert.match(String(forecast.updatedValues.dashboard_status), /30天预测已运行/);

  const campaign = await click(source, 'game-dashboard', 'dashboard-campaign-analyze', { campaign_analysis_id: 'CMP-2026-001' });
  assert.equal(campaign.result.flowExecuted, true);
  assert.equal(campaign.result.error, undefined);
  assert.equal(campaign.result.flowResults[0]?.success, true);
  assert.match(String(campaign.updatedValues.dashboard_status), /活动效果分析已运行/);
});
