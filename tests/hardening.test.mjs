import assert from 'node:assert/strict';
import test, { after } from 'node:test';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { imageSize } from 'image-size';
import '../build/image-security.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const vite=await createServer({appType:'custom',configFile:false,root,resolve:{alias:{'@':root}},server:{middlewareMode:true,hmr:false}});
after(()=>vite.close());
const ctx={waitUntil(){},passThroughOnException(){}};
const env={ASSETS:{fetch:async()=>new Response('not found',{status:404})},NEXT_PUBLIC_SITE_URL:'https://supersci-z.com',NEXT_PUBLIC_SUPABASE_URL:'https://audit-fixture.supabase.co',NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:'sb_publishable_audit_fixture',SUPABASE_GOOGLE_ENABLED:'true',SUPABASE_EMAIL_AUTH_MODE:'otp'};
const {default:worker}=await import(new URL('../dist/server/index.js',import.meta.url));

test('JSON-LD cannot close its script even with hostile metadata',async()=>{
 const {serializeJsonLd}=await vite.ssrLoadModule('/lib/security/json-ld.ts');
 const value={headline:'</script><script>alert("xss")</script><img src=x onerror=alert(1)>',description:'<>&\u2028\u2029'};
 const serialized=serializeJsonLd(value);
 assert.equal(serialized.includes('<'),false);
 assert.deepEqual(JSON.parse(serialized),value);
 const html='<script type="application/ld+json">'+serialized+'</script>';
 assert.equal([...html.matchAll(/<script\b/g)].length,1);
});

test('malformed cookies and redirect encodings fail safely',async()=>{
 const {parseRequestCookies}=await vite.ssrLoadModule('/lib/security/auth-cookies.ts');
 assert.deepEqual(parseRequestCookies('good=abc%3D; bad=%E0%A4%A; noequals; spaced name=x'),[{name:'good',value:'abc='}]);
 const {safeReturnPath}=await vite.ssrLoadModule('/lib/security/return-path.ts');
 for(const path of ['/conta%0d%0aLocation:https://evil.invalid','/%252f%252fevil.invalid','/%255cevil.invalid','/gestao?role=admin','https://supersci-z.com@evil.invalid']) assert.equal(safeReturnPath(path),'/conta');
 assert.equal(safeReturnPath('/conta'),'/conta');
 assert.equal(safeReturnPath('/'),'/');
 assert.equal(safeReturnPath('/?lang=pt'),'/?lang=pt');
 assert.equal(safeReturnPath('/gestao'),'/conta');
 const invite='/conta/convite?token='+'A'.repeat(43);
 assert.equal(safeReturnPath(invite),invite);
 assert.equal(safeReturnPath(invite+'&next=https://evil.invalid'),'/conta');
});

test('streamed bodies are bounded even without Content-Length and preserve signed text',async()=>{
 const {readBoundedText,readBoundedJson}=await vite.ssrLoadModule('/lib/security/request-body.ts');
 const body=' { "conteudo": "ciência 🛰️",\r\n "ordem": 1 } ';
 assert.equal(await readBoundedText(new Request('https://supersci-z.com/api/paddle/webhook',{method:'POST',body})),body);
 const signedBytes = new TextEncoder().encode('\uFEFF' + body);
 const preserved = await readBoundedText(new Request('https://supersci-z.com/api/paddle/webhook',{method:'POST',body:signedBytes}));
 assert.deepEqual(new TextEncoder().encode(preserved),signedBytes,'UTF-8 BOM and every signed byte must remain intact');
 const stream=new ReadableStream({start(c){c.enqueue(new Uint8Array(20));c.enqueue(new Uint8Array(20));c.close();}});
 await assert.rejects(readBoundedText(new Request('https://supersci-z.com/api/test',{method:'POST',body:stream,duplex:'half'}),30),{status:413});
 await assert.rejects(readBoundedJson(new Request('https://supersci-z.com/api/test',{method:'POST',body:'{}',headers:{'content-type':'text/plain'}})),{status:415});
});

test('page policies authorize a fresh nonce and prevent personal CDN caching',async()=>{
 const {newScriptNonce,contentSecurityPolicy,withSecurityHeaders,isPrivateAssetPath}=await vite.ssrLoadModule('/lib/security/headers.ts');
 const nonce=newScriptNonce(); assert.notEqual(nonce,newScriptNonce());
 const script=contentSecurityPolicy(nonce).split(';').find(x=>x.trim().startsWith('script-src '));
 assert.match(script,/nonce-/); assert.doesNotMatch(script,/unsafe-inline|unsafe-eval/);
 assert.throws(()=>contentSecurityPolicy('caller-controlled'));
 for(const path of ['/.env.local','/%2egit/config','/.openai/hosting.json','/assets/bundle.js.map','/work/output.json']) assert.equal(isPrivateAssetPath(path),true,path);
 assert.equal(isPrivateAssetPath('/brand/z-orbital.png'),false);
 const result=withSecurityHeaders(new Response('<html></html>',{headers:{'content-type':'text/html'}}),new Request('https://supersci-z.com/'),nonce);
 assert.match(result.headers.get('cache-control'),/no-store/); assert.equal(result.headers.get('cdn-cache-control'),'no-store');
 const privateResult=withSecurityHeaders(new Response(''),new Request('https://supersci-z.com/conta/convite?token=fixture'),nonce);
 assert.equal(privateResult.headers.get('referrer-policy'),'no-referrer');
 const image=withSecurityHeaders(new Response(''),new Request('https://supersci-z.com/_vinext/image'),nonce);
 assert.match(image.headers.get('content-security-policy'),/script-src 'none'.*sandbox/);
});

test('worker denies source paths, overlarge bodies and unused server actions before execution',async()=>{
 for(const path of ['/.env.local','/.git/config','/lib/supabase/admin.ts']){
  const response=await worker.fetch(new Request('https://supersci-z.com'+path),env,ctx);assert.equal(response.status,404);
 }
 const action=await worker.fetch(new Request('https://supersci-z.com/',{method:'POST',headers:{'next-action':'forged'},body:'{}'}),env,ctx);
 assert.equal(action.status,405);
 const large=await worker.fetch(new Request('https://supersci-z.com/api/account/preferences',{method:'PATCH',body:'x'.repeat(20_000)}),env,ctx);
 assert.equal(large.status,413);
});

test('security release does not expose management routes', async () => {
 for (const path of ['/gestao','/api/management','/api/management/chat']) {
  const response = await worker.fetch(new Request('https://supersci-z.com' + path),env,ctx);
  assert.equal(response.status,404,path);
 }
});

test('auth bridge requires same origin and never enables a disabled provider',async()=>{
 const cross=await worker.fetch(new Request('https://supersci-z.com/api/auth/session',{method:'POST',headers:{Origin:'https://evil.invalid','Content-Type':'application/json'},body:JSON.stringify({action:'email',email:'nobody@example.invalid'})}),env,ctx);
 assert.equal(cross.status,403);
 const disabled=await worker.fetch(new Request('https://supersci-z.com/api/auth/session',{method:'POST',headers:{Origin:'https://supersci-z.com','Content-Type':'application/json'},body:JSON.stringify({action:'oauth',provider:'apple'})}),env,ctx);
 assert.equal(disabled.status,403);
});

test('OAuth starts PKCE with HttpOnly cookies and canonical return URL',async()=>{
 const response=await worker.fetch(new Request('https://supersci-z.com/api/auth/session',{method:'POST',headers:{Origin:'https://supersci-z.com','Content-Type':'application/json'},body:JSON.stringify({action:'oauth',provider:'google',next:'https://evil.invalid'})}),env,ctx);
 assert.equal(response.status,200); const result=await response.json();
 const target=new URL(result.url); assert.equal(target.origin,'https://audit-fixture.supabase.co');
 assert.equal(target.searchParams.get('code_challenge_method'),'s256');
 assert.equal(new URL(target.searchParams.get('redirect_to')).origin,'https://supersci-z.com');
 assert.equal(new URL(target.searchParams.get('redirect_to')).searchParams.get('next'),'/conta');
 const cookies=response.headers.getSetCookie(); assert.ok(cookies.length>0);
 for(const cookie of cookies){assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Lax/i);}
 assert.doesNotMatch(JSON.stringify(result),/access_token|refresh_token|code-verifier/);
});

test('OTP verification keeps user records and tokens inside HttpOnly session cookies',async(t)=>{
 const now=Math.floor(Date.now()/1000);
 const sub='00000000-0000-4000-8000-000000000099';
 const b64=(x)=>Buffer.from(JSON.stringify(x)).toString('base64url');
 const jwt=b64({alg:'HS256',typ:'JWT'})+'.'+b64({sub,role:'authenticated',aud:'authenticated',exp:now+3600,iat:now})+'.audit-signature';
 const originalFetch=globalThis.fetch;
 t.mock.method(globalThis,'fetch',async(input,init)=>{
  const url=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  if(url==='https://audit-fixture.supabase.co/auth/v1/verify') return Response.json({access_token:jwt,refresh_token:'audit-refresh-token-not-real',token_type:'bearer',expires_in:3600,user:{id:sub,aud:'authenticated',role:'authenticated',email:'nobody@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()}});
  // A test must never fall through to a real provider.
  if(url.includes('audit-fixture.supabase.co')) throw new Error('Unexpected auth provider call');
  return originalFetch(input,init);
 });
 const response=await worker.fetch(new Request('https://supersci-z.com/api/auth/session',{method:'POST',headers:{Origin:'https://supersci-z.com','Content-Type':'application/json'},body:JSON.stringify({action:'verify',email:'nobody@example.invalid',token:'123456',next:'/conta'})}),env,ctx);
 assert.equal(response.status,200);const body=await response.text();
 assert.doesNotMatch(body,/access_token|refresh_token|00000000|nobody@/);
 assert.deepEqual(JSON.parse(body),{ok:true,next:'/conta'});
 const cookies=response.headers.getSetCookie();assert.ok(cookies.some(c=>c.includes('auth-token')));
 for(const cookie of cookies){assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);assert.match(cookie,/SameSite=Lax/i);}
});

test('malformed image formats are disabled before entering vulnerable parsers',async()=>{
 const icns=Buffer.alloc(16);icns.write('icns');icns.writeUInt32BE(16,4);icns.write('TOC ',8);
 const heif=Buffer.from('00000018667479706865696300000000686569636d696631','hex');
 const jxl=Buffer.from('0000000c4a584c200d0a870a00000014667479706a786c20000000006a786c20000000006a786c7000000000','hex');
 for(const [name,input] of [['icns',icns],['heif',heif],['jxl',jxl]]) assert.throws(()=>imageSize(input),/disabled/i,name);
 const png=await readFile(new URL('../public/logo-z-orbit.png',import.meta.url));
 assert.equal(imageSize(png).width,512);
});
test('logout clears a migrated existing session instead of restoring it from middleware', async (t) => {
 const now = Math.floor(Date.now() / 1000);
 const sub = '00000000-0000-4000-8000-000000000098';
 const b64 = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
 const jwt = b64({alg:'HS256',typ:'JWT'}) + '.' + b64({sub,role:'authenticated',aud:'authenticated',exp:now+3600,iat:now}) + '.audit-signature';
 const user = {id:sub,aud:'authenticated',role:'authenticated',email:'logout@example.invalid',app_metadata:{provider:'email'},user_metadata:{},created_at:new Date().toISOString()};
 let logoutCalls = 0;
 t.mock.method(globalThis, 'fetch', async (input) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (url.endsWith('/auth/v1/verify')) return Response.json({access_token:jwt,refresh_token:'audit-refresh-token-not-real',token_type:'bearer',expires_in:3600,user});
  if (url.endsWith('/auth/v1/user')) return Response.json(user);
  if (url.endsWith('/auth/v1/logout?scope=local')) { logoutCalls++; return new Response(null,{status:204}); }
  throw new Error('Unexpected external request in logout fixture');
 });
 const request = (body,cookie) => new Request('https://supersci-z.com/api/auth/session',{method:'POST',headers:{Origin:'https://supersci-z.com','Content-Type':'application/json',...(cookie ? {cookie} : {})},body:JSON.stringify(body)});
 const verified = await worker.fetch(request({action:'verify',email:user.email,token:'123456'}),env,ctx);
 assert.equal(verified.status,200);
 const cookie = verified.headers.getSetCookie().map(value => value.split(';')[0]).join('; ');
 const loggedOut = await worker.fetch(request({action:'logout'},cookie),env,ctx);
 assert.equal(loggedOut.status,200);
 assert.equal(logoutCalls,1);
 const sessionCookies = loggedOut.headers.getSetCookie().filter(value => value.startsWith('sb-audit-fixture-auth-token'));
 assert.ok(sessionCookies.length > 0);
 for (const value of sessionCookies) {
  assert.match(value,/^sb-audit-fixture-auth-token(?:\.\d+)?=;/);
  assert.match(value,/Max-Age=0/i);
  assert.match(value,/HttpOnly/i);
 }
});
test('email login starts server-side PKCE without returning account details', async (t) => {
 const paths = [];
 t.mock.method(globalThis,'fetch',async(input) => {
  const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
  paths.push(url.pathname);
  if (url.hostname === 'audit-fixture.supabase.co' && url.pathname === '/auth/v1/otp') return Response.json({});
  throw new Error('Unexpected external request in email fixture');
 });
 const response=await worker.fetch(new Request('https://supersci-z.com/api/auth/session',{
  method:'POST',headers:{Origin:'https://supersci-z.com','Content-Type':'application/json'},
  body:JSON.stringify({action:'email',email:'email-fixture@example.invalid',next:'/conta'})
 }),env,ctx);
 assert.equal(response.status,200,JSON.stringify({paths,body:await response.clone().text()}));
 assert.deepEqual(await response.json(),{ok:true});
 const cookies=response.headers.getSetCookie();
 assert.ok(cookies.some(c=>/code-verifier/.test(c)));
 for(const cookie of cookies) assert.match(cookie,/HttpOnly/i);
});
test('analytics excludes account/payment surfaces and never builds URLs with query tokens', async () => {
 const {analyticsPagePath,analyticsPageFields}=await vite.ssrLoadModule('/lib/analytics/privacy.ts');
 for (const path of ['/entrar','/conta','/conta/convite','/auth/callback','/gestao','/assine','/assine/sucesso','/api/auth/session','/%65ntrar','/revista?token=secret','/artigo/item#secret','/%E0%A4%A']) assert.equal(analyticsPagePath(path),null,path);
 assert.deepEqual(analyticsPageFields('https://supersci-z.com','/artigo/teste','Teste'),{page_location:'https://supersci-z.com/artigo/teste',page_path:'/artigo/teste',page_title:'Teste',page_referrer:''});
});

test("Google analytics queues native command objects rather than unsupported arrays", async () => {
  const { googleCommandQueue } = await vite.ssrLoadModule("/lib/analytics/queue.ts");
  const queue = [];
  const gtag = googleCommandQueue((command) => queue.push(command));
  const event = { page_location: "https://supersci-z.com/revista" };
  gtag("event", "page_view", event);
  assert.equal(Array.isArray(queue[0]), false);
  assert.equal(Object.prototype.toString.call(queue[0]), "[object Arguments]");
  assert.deepEqual(Array.from(queue[0]), ["event", "page_view", event]);
});
