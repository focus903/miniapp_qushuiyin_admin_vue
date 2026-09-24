export type ConfigValue = boolean | number | string | Record<string, string>;
export type ConfigValues = Record<string, ConfigValue>;
export type ConfigGroup = {id:number;code:string;label:string;parent_id:number|null;sort_order:number};
export type ConfigField = {
  key:string;label:string;description:string;group_id:number;sort_order:number;
  control:'switch'|'input'|'textarea'|'number'|'radio'|'select'|'time'|'datetime'|'json';
  format:string;options?:{label:string;value:string|boolean|number}[];
};
export type ConfigSchema = {groups:ConfigGroup[];fields:ConfigField[]};
export type ConfigSection = ConfigGroup & {fields:ConfigField[]};
export type ConfigTab = ConfigSection & {children:ConfigSection[]};

/** 由服务端元数据决定顺序与归属，不依赖固定配置键或分组名称。 */
export function configTabs(schema:ConfigSchema):ConfigTab[]{
  const sections=new Map<number,ConfigSection>(schema.groups.map(group=>[group.id,{...group,fields:[]}]));
  for(const field of schema.fields){
    const group=sections.get(field.group_id);
    if(!group)throw new Error('配置项所属分组不存在，请检查配置。');
    group.fields.push(field);
  }
  const compare=(a:ConfigGroup,b:ConfigGroup)=>a.sort_order-b.sort_order||a.id-b.id;
  for(const group of sections.values()){
    group.fields.sort((a,b)=>a.sort_order-b.sort_order||a.key.localeCompare(b.key));
    if(group.parent_id!==null){
      const parent=sections.get(group.parent_id);
      if(!parent||parent.parent_id!==null)throw new Error('配置分组必须为有效的两级结构。');
    }
  }
  return [...sections.values()].filter(group=>group.parent_id===null).sort(compare).map(group=>({
    ...group,children:[...sections.values()].filter(child=>child.parent_id===group.id).sort(compare),
  }));
}
