export interface Permission {code:string;name:string;module?:string;page?:string}
export interface PermissionNode {id:string;label:string;children?:PermissionNode[]}
/** 父节点只用于展示，提交仅包含原始权限代码；未知已选项显式保留。 */
export function permissionNodes(permissions:Permission[],selected:string[]=[]):PermissionNode[]{
 const all=new Map(permissions.map(permission=>[permission.code,permission]));
 for(const code of selected)if(!all.has(code))all.set(code,{code,name:`未知权限：${code}`,module:'未知权限',page:'历史或自定义权限'});
 const groups=new Map<string,PermissionNode>();
 for(const permission of all.values()){
  const module=permission.module||'其他权限';const page=permission.page||permission.code.split(':')[0]||'其他页面';
  if(!groups.has(module))groups.set(module,{id:`__module__:${module}`,label:module,children:[]});
  const group=groups.get(module)!;let node=group.children!.find(item=>item.label===page);
  if(!node){node={id:`__page__:${module}:${page}`,label:page,children:[]};group.children!.push(node);}
  node.children!.push({id:permission.code,label:permission.name});
 }
 return [...groups.values()];
}
export function permissionLeaves(nodes:PermissionNode[]):string[]{return nodes.flatMap(node=>node.children?permissionLeaves(node.children):[node.id]);}
export function selectedPermissions(keys:unknown[],nodes:PermissionNode[]):string[]{
 const leaves=new Set(permissionLeaves(nodes));
 return [...new Set(keys.filter((key):key is string=>typeof key==='string'&&leaves.has(key)))];
}
