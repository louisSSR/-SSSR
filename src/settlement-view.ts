import { makeSettlementReceipt, type Ledger } from './core';

/** Display receipt for one committed evaluation; immutable per-transaction receipts stay intact. */
export function buildRoundReceipt(before: Ledger, after: Ledger): string {
  const oldTransactions = new Set(before.transactions.map(item => item.id));
  const transactions = after.transactions.filter(item => !oldTransactions.has(item.id));
  const gains = transactions.map(tx => {
    if (tx.kind === 'credit') {
      const event = after.events.find(item => item.id === tx.referenceId)!;
      return `${event.source}；${event.outcome} -- 新增因果点 +${tx.amount}；已入账`;
    }
    if (tx.kind === 'purchase') return `兑换 ${after.quotes.find(item => item.id === tx.referenceId)?.name ?? tx.referenceId} × ${tx.quantity}；消耗 ${tx.amount} 点`;
    return `${tx.kind === 'use' ? '实际使用' : `移交给 ${tx.recipient}`} ${tx.referenceId} × ${tx.quantity}；不重复扣点`;
  });
  const standards = transactions.filter(tx => tx.kind === 'credit').map(tx => {
    const event = after.events.find(item => item.id === tx.referenceId)!;
    const standard = after.standards.find(item => item.id === event.standardId)!;
    return `${standard.spec}：固定收益 ${standard.reward}`;
  });
  const oldQuotes = new Set(before.quotes.map(item => item.id));
  const oldInventory = new Set(before.inventory.map(item => item.id));
  const oldQuests = new Map((before.quests ?? []).map(item => [item.id, item]));
  const activeRipples = after.ripples.filter(item => item.status === 'active');
  const activeQuests = (after.quests ?? []).filter(item => item.status === 'active');
  const next = [
    ...activeRipples.slice(-8).map(item => `${item.source}：${item.tracking}`),
    ...activeQuests.slice(-8).map(item => `${item.title}：进行中；${item.objective}`),
    ...(after.quests ?? []).filter(item => item.status === 'offered' && !oldQuests.has(item.id)).map(item => `${item.title}：待接取；${item.objective}`),
  ];
  const omitted = Math.max(0, activeRipples.length - 8) + Math.max(0, activeQuests.length - 8);
  if (omitted) next.push(`另有 ${omitted} 项持续追踪，完整目标仍在四表与任务档案中`);
  for (const quote of after.quotes.filter(item => !oldQuotes.has(item.id))) standards.push(`新增可选报价（尚未购买）：${quote.name}；每份固定价格 ${quote.price}；类型 ${quote.kind}；完整规格 ${JSON.stringify(quote.spec)}`);
  return makeSettlementReceipt({
    gains: gains.length ? gains : ['本次核对无新增计功或消费；已结算事实不重复入账'],
    before: before.balance, after: after.balance, income: after.income, spend: after.spend,
    standards: [...new Set(standards)],
    unlocked: after.inventory.filter(item => !oldInventory.has(item.id)).map(item => `${item.name} × ${item.acquired} 已实际到账；完整规格 ${JSON.stringify(item.spec)}`),
    next,
  });
}
