import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {pathToFileURL} from "node:url";
import {after,it} from "node:test";
import ts from "typescript";
const dir=mkdtempSync(join(tmpdir(),"omniflow-channel-scope-"));
after(()=>rmSync(dir,{recursive:true,force:true}));
async function compile(name,path){writeFileSync(join(dir,name+".mjs"),ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText);return import(pathToFileURL(join(dir,name+".mjs")).href);}
const {buildKeywordProxyTarget}=await compile("keywords","../src/lib/keywords/proxy-utils.ts");
const {flowsApi}=await compile("flows","../src/lib/flows/browser.ts");
const a="123e4567-e89b-42d3-a456-426614174001",b="123e4567-e89b-42d3-a456-426614174002";
it("keyword proxy keeps the selected channel and rejects missing, malformed and private fields",()=>{
 const body={keyword_text:"hi",match_type:"exact",channel_connection_id:a,flow_id:b};
 assert.deepEqual(buildKeywordProxyTarget("POST",[],body).body,body);
 assert.equal(buildKeywordProxyTarget("POST",[],{keyword_text:"hi",match_type:"exact"}),null);
 for(const channel_connection_id of [null,"", "all", "not-a-uuid"])assert.equal(buildKeywordProxyTarget("POST",[],{...body,channel_connection_id}),null);
 assert.equal(buildKeywordProxyTarget("POST",[],{...body,tenant_id:b}),null);
 assert.equal(buildKeywordProxyTarget("POST",[],{...body,flow_id:"bad"}),null);
 assert.equal(buildKeywordProxyTarget("PATCH",[b],{channel_connection_id:null}),null);
 assert.equal(buildKeywordProxyTarget("PATCH",[b],{channel_connection_id:a}).body.channel_connection_id,a);
});
it("flow create and update forward a specific channel ID without inventing all-channels scope",async()=>{
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({id:b,channel_connection_id:a});};
 try {await flowsApi.create("Villa flow",a);await flowsApi.update(b,{channel_connection_id:a});assert.deepEqual(calls[0].body,{name:"Villa flow",channel_connection_id:a});assert.equal(calls[1].body.channel_connection_id,a);}
 finally{globalThis.fetch=previous;}
});
it("channel-filtered flow choices fetch later pages with the same filter",async()=>{
 const previous=globalThis.fetch,calls=[];
 globalThis.fetch=async(url)=>{calls.push(url);const skip=Number(new URL(url,"http://local").searchParams.get("skip"));return Response.json({items:skip===0?[{id:a,channel_connection_id:b}]:[{id:b,channel_connection_id:b}],total:2});};
 try {const result=await flowsApi.list(undefined,b);assert.equal(result.items.length,2);assert.equal(calls.length,2);for(const url of calls)assert.equal(new URL(url,"http://local").searchParams.get("channel_connection_id"),b);assert.equal(new URL(calls[1],"http://local").searchParams.get("skip"),"1");}
 finally{globalThis.fetch=previous;}
});
