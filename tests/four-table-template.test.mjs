import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { createEmptyMemoryTableTemplate, serializeMemoryTableTemplate, templateFile } from '../database/generate-memory-four-tables.mjs';

const template = JSON.parse(readFileSync(templateFile, 'utf8'));
const keys = Array.from({ length: 4 }, (_, index) => `sheet_shiro_memory_${index + 1}`);

test('standalone four-table JSON is reproducible from the current native exporter', () => {
  assert.equal(readFileSync(templateFile, 'utf8'), serializeMemoryTableTemplate());
  assert.deepEqual(createEmptyMemoryTableTemplate(), template);
});

test('four stable sheet identities have only headers and no account or example records', () => {
  assert.deepEqual(Object.keys(template), ['mate', ...keys]);
  assert.equal(template.mate.type, 'chatSheets');
  assert.equal(template.mate.version, 1);
  const names = ['蝴蝶·一、重要印象', '蝴蝶·二、点数账目', '蝴蝶·三、消费与所得', '蝴蝶·四、连锁反应与任务'];
  for (const [index, key] of keys.entries()) {
    assert.equal(template[key].uid, key);
    assert.equal(template[key].name, names[index]);
    assert.equal(template[key].orderNo, index);
    assert.equal(template[key].content.length, 1);
    assert.deepEqual(template[key].content[0].slice(0, 6), ['row_id', '记录ID', '本源账户', '记录种类', '稳定序号', '业务ID']);
  }
  assert.doesNotMatch(JSON.stringify(template), /empty-template|2026-10-06|shiro-memory:/);
});

test('all tables disable worldbook export, injection and automatic fill independently', () => {
  for (const key of keys) {
    const sheet = template[key];
    assert.equal(sheet.exportConfig.enabled, false);
    assert.equal(sheet.exportConfig.injectIntoWorldbook, false);
    assert.equal(sheet.exportConfig.extraIndexEnabled, false);
    assert.equal(sheet.updateConfig.updateFrequency, 0);
    assert.match(sheet.sourceData.note, /白·蝴蝶四表业务真源 v2/);
    assert.match(sheet.sourceData.note, /可读业务列就是账本真源/);
    assert.match(sheet.sourceData.updateNode, /禁止自动填表/);
    for (const field of ['note', 'initNode', 'insertNode', 'updateNode', 'deleteNode', 'ddl']) assert.equal(typeof sheet.sourceData[field], 'string');
  }
});

test('all four DDLs execute in SQLite with exact columns and preserve precise text and stable record identity', () => {
  const db = new DatabaseSync(':memory:');
  try {
    for (const [index, key] of keys.entries()) {
      const sheet = template[key], name = `shiro_memory_${index + 1}`;
      db.exec(sheet.sourceData.ddl);
      const columns = db.prepare(`PRAGMA table_info(${name})`).all();
      assert.equal(columns.length, sheet.content[0].length);
      assert.equal(columns[1].name, 'record_id');
      assert.equal(columns[0].pk, 1);
      assert.ok(columns.slice(1).every(column => column.type === 'TEXT'));
      assert.equal(columns[1].notnull, 1);
      const values = ['record-1', 'fixture-account', ...sheet.content[0].slice(3).map(() => '12345678901234567890.123456789012345678')];
      const insert = db.prepare(`INSERT INTO ${name} (${columns.slice(1).map(column => column.name).join(',')}) VALUES (${values.map(() => '?').join(',')})`);
      insert.run(...values);
      assert.deepEqual(Object.values(db.prepare(`SELECT ${columns.slice(1).map(column => column.name).join(',')} FROM ${name}`).get()), values);
      assert.throws(() => insert.run(...values), /UNIQUE constraint/);
      assert.throws(() => insert.run(null, ...values.slice(1)), /NOT NULL constraint/);
    }
    assert.equal(db.prepare("SELECT COUNT(*) AS total FROM sqlite_master WHERE type='table'").get().total, 4);
  } finally { db.close(); }
});
