/** 后台统一日期快捷选项，按浏览器本地时区计算，每次点击重新取当前日期。 */
type RangeKind='today'|'yesterday'|'week'|'currentMonth'|'previousMonth'|'month'|'threeMonths'|'sixMonths';
function shiftMonths(date:Date,months:number):Date {
 const result=new Date(date);const day=result.getDate();
 result.setDate(1);result.setMonth(result.getMonth()+months);
 const last=new Date(result.getFullYear(),result.getMonth()+1,0).getDate();
 result.setDate(Math.min(day,last));return result;
}
export function rangeFor(kind:RangeKind,now=new Date()):[Date,Date] {
 let start=new Date(now);const end=new Date(now);
 switch(kind){
  case 'yesterday':start.setDate(start.getDate()-1);end.setDate(end.getDate()-1);break;
  case 'week':start.setDate(start.getDate()-6);break;
  case 'currentMonth':start.setDate(1);break;
  case 'previousMonth':start.setDate(1);start.setMonth(start.getMonth()-1);end.setDate(0);break;
  case 'month':start=shiftMonths(start,-1);break;
  case 'threeMonths':start=shiftMonths(start,-3);break;
  case 'sixMonths':start=shiftMonths(start,-6);break;
 }
 start.setHours(0,0,0,0);end.setHours(23,59,59,999);
 return [start,end];
}
export function createDateShortcuts(range:boolean){
 const choices:[string,RangeKind][]=range?
  [['今天','today'],['昨天','yesterday'],['一周','week'],['本月','currentMonth'],['上个月','previousMonth'],['一个月','month'],['近三个月','threeMonths'],['近六个月','sixMonths']]:
  [['今天','today'],['昨天','yesterday'],['本月月初','currentMonth'],['上月月初','previousMonth'],['一个月前','month'],['三个月前','threeMonths'],['六个月前','sixMonths']];
 return choices.map(([text,kind])=>({text,value:()=>range?rangeFor(kind):rangeFor(kind)[0]}));
}
