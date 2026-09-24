/** 按当前列表顺序整组移动，目标位于选中组内时保持原位。 */
export function moveGroup(ids: number[], selected: number[], target: number, after: boolean): number[] {
 const picked = new Set(selected);
 if (!ids.includes(target) || picked.has(target)) return [...ids];
 const group = ids.filter(id => picked.has(id));
 if (!group.length) return [...ids];
 const rest = ids.filter(id => !picked.has(id));
 rest.splice(rest.indexOf(target) + Number(after), 0, ...group);
 return rest;
}
