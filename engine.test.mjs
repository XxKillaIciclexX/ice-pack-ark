import {test} from 'node:test';import assert from 'node:assert/strict';import {normalize,isFinal,action} from './engine.mjs';
test('streak waits for final',()=>{const e={giftId:1,giftType:1,repeatCount:50,diamondCount:1};assert.equal(isFinal(normalize(e)),false);assert.equal(isFinal(normalize({...e,repeatEnd:true})),true);assert.equal(action(normalize(e)),'Raptor');});
test('unknown cost is not routed',()=>assert.equal(action(normalize({giftId:9})),'Needs gift metadata'));
test('catalog fallback',()=>assert.equal(normalize({giftId:4},{4:{name:'Rose',coins:1}}).coins,1));
