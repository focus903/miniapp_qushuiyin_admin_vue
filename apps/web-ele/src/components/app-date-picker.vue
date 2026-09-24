<script lang="ts">
import { defineComponent, h } from 'vue';
import { ElDatePicker } from 'element-plus';
import { createDateShortcuts } from '../utils/date-shortcuts';

export default defineComponent({
 name:'AppDatePicker',
 inheritAttrs:false,
 setup(_, {attrs,slots}){
  return ()=>h(ElDatePicker,{
   ...attrs,
   shortcuts:Array.isArray(attrs.shortcuts)?attrs.shortcuts:createDateShortcuts(String(attrs.type||'date').includes('range')),
   popperClass:['creatorhub-date-shortcuts',attrs.popperClass||attrs['popper-class']||''].filter(Boolean).join(' '),
  },slots);
 },
});
</script>
<style>
/* 仅影响统一组件的弹层：保留日历和原生清除/确认，将快捷选项放到底部。 */
.creatorhub-date-shortcuts .el-picker-panel__body-wrapper {
 display:flex;
 flex-direction:column;
}
.creatorhub-date-shortcuts .el-picker-panel__body {
 order:0;
 margin-left:0 !important;
}
.creatorhub-date-shortcuts .el-picker-panel__sidebar {
 position:static;
 order:1;
 display:flex;
 flex-wrap:wrap;
 gap:6px;
 box-sizing:border-box;
 width:100%;
 height:auto;
 padding:8px 12px;
 border-right:0;
 border-top:1px solid var(--el-border-color-lighter);
}
.creatorhub-date-shortcuts .el-picker-panel__shortcut {
 width:auto;
 padding:0 7px;
 border:1px solid var(--el-border-color);
 border-radius:3px;
 font-size:12px;
 line-height:24px;
 white-space:nowrap;
}
.creatorhub-date-shortcuts .el-picker-panel__shortcut:hover {
 background:var(--el-color-primary-light-9);
 border-color:var(--el-color-primary);
}
.creatorhub-date-shortcuts .el-date-range-picker.has-sidebar {width:646px;}
.creatorhub-date-shortcuts .el-date-picker.has-sidebar {width:328px;}
.creatorhub-date-shortcuts .el-date-picker.has-sidebar.has-time {width:324px;}
.creatorhub-date-shortcuts .el-date-range-picker.single-panel.has-sidebar {width:328px;}
@media(max-width:680px){
 .creatorhub-date-shortcuts .el-date-range-picker.has-sidebar {width:min(646px,calc(100vw - 24px));}
 .creatorhub-date-shortcuts .el-date-range-picker__content {padding:8px;}
}
</style>
