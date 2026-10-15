import {test} from 'node:test';
import assert from 'node:assert/strict';
import {asrModelInfo} from '../src/utils/asr-model-info.ts';
test('当前Whisper型号与语言定位明确，small不固定为其他型号',()=>{
 const info=asrModelInfo('small');assert.equal(info.label,'Whisper · small');assert.equal(info.language,'多语言模型');assert.match(info.scene,/中文/);assert.match(info.note,/按中文识别/);
 assert.equal(asrModelInfo('large-v3').label,'Whisper · large-v3');
});
test('加载前和未知型号不伪装为已配置或已支持',()=>{
 assert.equal(asrModelInfo(undefined).label,'模型配置加载中');assert.equal(asrModelInfo('paraformer').language,'待确认');
});
test('后续可按模型体系扩展，而不加入尚未接入的选项',()=>{
 const info=asrModelInfo('paraformer-zh','paraformer');assert.match(info.label,/Paraformer/);assert.equal(info.language,'中文模型');
 assert.equal(asrModelInfo('small','unknown').language,'待确认');
});
