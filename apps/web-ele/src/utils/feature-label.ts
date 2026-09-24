/** 后台功能名称与标识统一展示；优先使用接口返回的名称。 */
const names:Record<string,string>={parse_share:'链接视频/图集去水印',extract_text:'视频文案提取（旧）',extract_text_link:'链接视频文案提取',extract_text_upload:'上传视频文案提取',remove_subtitle:'上传视频去字幕',remove_watermark:'上传视频去水印',tts:'文字配音',image_repair:'上传图片去水印',image_large:'上传图片高清',image_compress:'上传图片压缩',image_ocr:'上传图片文字识别',admin_deduct:'人工扣除'};
export function featureLabel(value:unknown,name?:unknown):string{
 const code=String(value??'');if(!code)return '';
 const title=String(name||names[code]||'');
 return title&&title!==code?`${title} / ${code}`:code;
}
