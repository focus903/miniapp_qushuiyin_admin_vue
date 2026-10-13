// 阶段存在嵌套和流水线重叠，不将阶段耗时相加。
const labels: Record<string,string> = {
  processing_wall:'处理总耗时', total:'视频流程', demux_decode:'读取与解码', decode:'像素转换',
  detect:'字幕检测', mask:'字幕掩码', repair:'画面修复', encode:'视频编码', audio:'音频处理',
  finalize:'编码收尾', lama_model_load:'模型加载', lama_inpaint:'模型内部修复',
  lama_exchange:'帧交换与模型等待', lama_raw_pack:'原始像素打包', lama_raw_unpack:'结果像素还原',
};
export const formatSeconds = (value?:number) => typeof value==='number'&&Number.isFinite(value)&&value>=0 ? `${value.toFixed(3)} 秒` : '—';
export function timingStages(seconds:Record<string,number> = {}) {
  return Object.entries(labels).flatMap(([stage,label])=>{
    const value=seconds[stage];
    return typeof value==='number'&&Number.isFinite(value)&&value>=0 ? [{stage,label,formatted:formatSeconds(value)}] : [];
  });
}
