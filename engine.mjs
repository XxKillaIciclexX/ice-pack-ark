export function normalize(e, catalog={}) {
 const g=e.giftDetails??e.gift??{}; const id=String(e.giftId??g.giftId??g.id??'');
 const old=catalog[id]??{}; const raw=e.diamondCount??g.diamondCount??g.diamond_count??old.coins;
 const coins=raw==null?null:Number(raw); const count=Number(e.repeatCount??1);
 return {id,name:e.giftName??g.giftName??g.name??old.name??`Gift ${id}`,coins:Number.isSafeInteger(coins)&&coins>0?coins:null,count:Number.isSafeInteger(count)&&count>0?count:1,type:Number(e.giftType??g.giftType??g.type??0),end:e.repeatEnd===true||e.repeatEnd===1,sender:e.user?.uniqueId??e.uniqueId??'Viewer',messageId:String(e.common?.msgId??e.msgId??''),groupId:String(e.groupId??'')};
}
export function isFinal(g){return g.type!==1||g.end;}
export function action(g){const n=g.coins*g.count;if(!g.coins)return 'Needs gift metadata';return n<10?'Dodo':n<100?'Raptor':n<500?'Carnotaurus':n<1000?'Rex':'Giga';}
