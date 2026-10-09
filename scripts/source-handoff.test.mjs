import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { commercialSourceSha256, handoffErrors } from './lib/airport-source-handoff.mjs';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const start = '<!-- siilas-testing:start -->';
const end = '<!-- siilas-testing:end -->';
const source = `---
title: 示例机场
permalink: /posts/example/
dateModified: 2020/10/08
updated: 2020/10/07
---

## 商业资料
月付20元，120GB；商业核对日期2020-10-05。

${start}
## Siilas 测速与使用体验记录
接收2条测速，下载100Mbps。
${end}

## 客户端
支持通用订阅。
dateModified: 这是正文说明，不能排除。
`;
const sourceVersion = (markdown, filename = '示例机场.md') => ({
  filename,
  sourceSha256: hash(markdown),
  sourceCommercialSha256: commercialSourceSha256(markdown, filename),
  sourceUpdatedAt: markdown.match(/^dateModified:\s*(\S+)/mu)[1].replaceAll('/', '-'),
});
const fixture = (markdown = source, legacy = false) => {
  const initial = sourceVersion(markdown);
  const received = {
    fieldHashes: { sourcePage: hash(JSON.stringify('https://yp7.net/posts/example/')) },
    detailsSha256: hash('plans'), highlightsSha256: hash('highlights'),
  };
  const entry = { name: '示例机场', kind: 'tested', sourcePage: 'https://yp7.net/posts/example/', received };
  const accepted = {
    ...entry, sourceFile: initial.filename, sourceSha256: initial.sourceSha256,
    sourceUpdatedAt: initial.sourceUpdatedAt, acceptedAt: '2020-10-09', acceptanceNote: '人工复核商业资料',
    ...(!legacy ? { sourceCommercialSha256: initial.sourceCommercialSha256 } : {}),
  };
  return { entries: new Map([['example', entry]]), manifest: { airports: { example: accepted } } };
};
const errorsFor = (state, markdown, filename) => handoffErrors(
  state.entries, state.manifest, new Map([['example', sourceVersion(markdown, filename)]]),
);

test('合法自动测速块和自动编辑日期更新不会重新触发商业接收，全文审计版本保留', () => {
  const state = fixture();
  const changed = source.replace('接收2条测速，下载100Mbps。', '接收3条测速，下载200Mbps。')
    .replace('dateModified: 2020/10/08', 'dateModified: 2020/10/09');
  assert.notEqual(hash(changed), hash(source));
  assert.equal(commercialSourceSha256(changed), commercialSourceSha256(source));
  assert.deepEqual(errorsFor(state, changed), []);
  assert.equal(state.manifest.airports.example.sourceSha256, hash(source));
  assert.equal(state.manifest.airports.example.sourceUpdatedAt, '2020-10-08');
  assert.equal(commercialSourceSha256(changed.replaceAll('\n', '\r\n')), commercialSourceSha256(source.replaceAll('\n', '\r\n')));
});

test('块外正文、套餐、商业日期、permalink及其他元字段变化仍需人工复核', () => {
  const state = fixture();
  for (const changed of [
    source.replace('月付20元', '月付21元'),
    source.replace('120GB', '150GB'),
    source.replace('2020-10-05', '2020-10-06'),
    source.replace('支持通用订阅', '不支持通用订阅'),
    source.replace('/posts/example/', '/posts/other/'),
    source.replace('title: 示例机场', 'title: 其他标题'),
    source.replace('updated: 2020/10/07', 'updated: 2020/10/09'),
    source.replace('这是正文说明', '这是修改后的正文说明'),
  ]) {
    assert.notEqual(commercialSourceSha256(changed), commercialSourceSha256(source));
    assert.ok(errorsFor(state, changed).some((error) => error.includes('商业来源已变化')));
  }
});

test('来源文件路径、URL、本地商业字段和表格变化不可由测速块豁免', () => {
  assert.ok(errorsFor(fixture(), source, '新路径.md').length > 0);
  const changedUrl = fixture();
  changedUrl.entries.set('example', { ...changedUrl.entries.get('example'), sourcePage: 'https://yp7.net/posts/other/' });
  assert.ok(errorsFor(changedUrl, source).some((error) => error.includes('来源页或资料类型')));
  const changedFields = fixture();
  changedFields.entries.get('example').received = {
    ...changedFields.entries.get('example').received,
    fieldHashes: { sourcePage: hash('changed') }, detailsSha256: hash('new plans'),
  };
  const errors = errorsFor(changedFields, source);
  assert.ok(errors.some((error) => error.includes('已接收商业字段变动')));
  assert.ok(errors.some((error) => error.includes('套餐/客户端表变动')));
});

test('没有自动测速块时维持完整文章语义，编辑日期也不能绕过检查', () => {
  const plain = source.replace(`${start}\n## Siilas 测速与使用体验记录\n接收2条测速，下载100Mbps。\n${end}`, '');
  assert.equal(commercialSourceSha256(plain), hash(plain));
  const state = fixture(plain);
  const changed = plain.replace('dateModified: 2020/10/08', 'dateModified: 2020/10/09');
  assert.ok(errorsFor(state, changed).length > 0);
  assert.ok(errorsFor(fixture(), plain).length > 0, '删除整个受控块也改变来源版本');
});

test('缺失、重复、反向、内联或frontmatter内的自动块标记拒绝接收', () => {
  for (const markdown of [
    source.replace(end, ''), source.replace(start, ''),
    source + `\n${start}\n${end}\n`,
    source.replace(start, end).replace(`${end}\n\n## 客户端`, `${start}\n\n## 客户端`),
    source.replace(start, `正文 ${start}`), source.replace(end, `${end} 正文`),
    `---\n${start}\n${end}\n---\n商业资料`,
  ]) assert.throws(() => commercialSourceSha256(markdown), /标记无效/u);
  assert.throws(() => commercialSourceSha256(source.replace('dateModified: 2020/10/08', 'dateModified: 2020/10/08\ndateModified: 2020/10/09')), /日期字段重复/u);
});

test('旧清单继续严格比较全文和编辑日期，人工迁移后才允许测速块更新', () => {
  const state = fixture(source, true);
  assert.deepEqual(errorsFor(state, source), []);
  const changed = source.replace('下载100Mbps', '下载200Mbps');
  assert.ok(errorsFor(state, changed).some((error) => error.includes('完整来源文章已变化')));
  assert.ok(errorsFor(state, source.replace('dateModified: 2020/10/08', 'dateModified: 2020/10/09')).length > 0);
  state.manifest.airports.example.sourceCommercialSha256 = commercialSourceSha256(source);
  assert.deepEqual(errorsFor(state, changed), []);
  state.manifest.airports.example.sourceCommercialSha256 = 'invalid';
  assert.ok(errorsFor(state, changed).some((error) => error.includes('商业来源指纹格式无效')));
});
