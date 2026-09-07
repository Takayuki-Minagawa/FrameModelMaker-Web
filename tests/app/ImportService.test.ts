import { afterEach, expect, it, vi } from 'vitest';
import { ImportService } from '../../src/app/ImportService';
import { prepareDocumentImport } from '../../src/io/ImportDocument';
import { FrameDocument } from '../../src/models/FrameDocument';
import { writeFrameJson } from '../../src/io/FrameJson';
afterEach(()=>vi.unstubAllGlobals());
it('terminates obsolete workers and rejects old revisions', async()=>{
  class WorkerFake {
    static instances:WorkerFake[]=[]; message:any; onmessage:any; onerror:any; terminated=false;
    constructor(){WorkerFake.instances.push(this);}postMessage(message:unknown){this.message=message;}terminate(){this.terminated=true;}
  }
  vi.stubGlobal('Worker',WorkerFake);const service=new ImportService();const text=' '.repeat(1024*1024);
  const first=service.prepare(text,'json',1);const rejected=expect(first).rejects.toThrow(/superseded/);
  const second=service.prepare(text,'json',2);await rejected;expect(WorkerFake.instances[0].terminated).toBe(true);
  const worker=WorkerFake.instances[1];const result=await prepareDocumentImport(writeFrameJson(new FrameDocument()),'json');
  worker.onmessage({data:{...worker.message,result}});await expect(second).resolves.toEqual(result);expect(worker.terminated).toBe(true);
});
it('validates detached JSON without modifying the source document',async()=>{
  const doc=new FrameDocument();doc.addNode();const text=writeFrameJson(doc);const result=await prepareDocumentImport(text,'json');
  expect(result.model.nodes).toHaveLength(1);expect(writeFrameJson(doc)).toBe(text);
});
