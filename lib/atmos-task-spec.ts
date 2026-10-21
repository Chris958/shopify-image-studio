import type {Doc, Task} from './atmos-types';

export function hasPublishedTaskSpec(task:Task){
 return task.spec?.status==='published'&&!!task.specId&&task.specId!=='sample-spec';
}

export function bindTaskSpec(task:Task,doc:Doc):Task{
 if(doc.kind!=='spec'||doc.data.status!=='published')throw new Error('只能引用已发布的品牌规范');
 return {...task,spec:structuredClone(doc.data),specId:doc.id};
}

export function hasTaskOutputs(task:Task){
 return !!(task.variants?.length||task.exports?.length||(task as any).history?.length);
}

/** Repair the pre-publication task without resetting its inputs or a pinned version. */
export function syncPendingTaskSpec(task:Task,published?:Doc):Task{
 if(!published||hasPublishedTaskSpec(task)||hasTaskOutputs(task))return task;
 return bindTaskSpec(task,published);
}

/** A deliberate version change starts a fresh task; the original keeps its outputs. */
export function copyTaskForSpec(task:Task,published:Doc):Task{
 return {...bindTaskSpec(structuredClone(task),published),variants:[],exports:[],status:'草稿',selected:0,history:[],layoutPlans:[]} as Task;
}
