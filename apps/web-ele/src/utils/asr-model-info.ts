/** 模型展示信息独立于执行逻辑；增加体系时需同步实际后端支持。 */
interface ModelProfile { family:string;language:string;scene:string;note:string;models:readonly string[] }
const profiles:Record<string,ModelProfile>={
 whisper:{family:'Whisper',language:'多语言模型',
  scene:'适合中文视频文案、课程、访谈及多语言音视频转写。',
  note:'当前主项目按中文识别；模型支持多语言，不代表已开放语言切换。更大的型号通常更耗内存、显存和计算资源，识别效果与速度请用实际音频比较。',
  models:['tiny','base','small','medium','large-v1','large-v2','large-v3','large-v3-turbo']},
 paraformer:{family:'Paraformer',language:'中文模型',scene:'中文型号适合普通话课程、访谈及中文视频文案转写。',
  note:'此说明对应中文Paraformer型号；接入其他语言型号时需单独维护语言范围。',models:['paraformer-zh']},
};
export function asrModelInfo(model:unknown,engine='whisper'){
 if(typeof model!=='string'||!model)return {label:'模型配置加载中',language:'待确认',scene:'等待读取后台配置。',note:''};
 const profile=profiles[engine];
 if(!profile||!profile.models.includes(model))return {label:`${profile?.family||'未知模型体系'} · ${model}`,language:'待确认',scene:'当前型号尚未维护场景说明，请核对后端支持。',note:''};
 return {label:`${profile.family} · ${model}`,language:profile.language,scene:profile.scene,note:profile.note};
}
