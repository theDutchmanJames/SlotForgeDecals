const test=require('node:test'),assert=require('node:assert/strict');
const {validate,notes}=require('../scripts/publish-recovered-apple.cjs');
test('Apple attachment only adds missing arm64 assets to the exact verified public release',()=>{
 const sha='a'.repeat(40),base='SlotForgeDecals-0.2.20-windows-x64.exe',apple='SlotForgeDecals-0.2.20-mac-arm64.dmg';
 const release={draft:false,prerelease:false,assets:[{name:base,digest:'sha256:original'}]},hashes={[base]:'sha256:original',[apple]:'sha256:apple'};
 assert.doesNotThrow(()=>validate(release,sha,sha,hashes));
 assert.throws(()=>validate(release,sha,'b'.repeat(40),hashes));
 assert.throws(()=>validate({...release,draft:true},sha,sha,hashes));
 assert.throws(()=>validate({...release,assets:[]},sha,sha,hashes));
 assert.throws(()=>validate(release,sha,sha,{...hashes,[base]:'sha256:changed'}));
 assert.throws(()=>validate({...release,assets:[...release.assets,{name:apple,digest:'sha256:old'}]},sha,sha,hashes));
 assert.throws(()=>validate({...release,assets:[...release.assets,...release.assets]},sha,sha,hashes));
 assert.doesNotThrow(()=>validate({...release,assets:[...release.assets,{name:apple,digest:'sha256:apple'}]},sha,sha,hashes));
});
test('Apple release notes disclose added downloads and preserve feature notes',()=>{
 const body='**Platform availability:** Apple Silicon excluded.\n\n# App\nFeatures.\n| Intel Mac | mac-x64.dmg |\nApple Silicon is excluded. Mac builds require macOS 15 or newer.';
 const updated=notes(body);assert(!updated.includes('excluded'));assert(updated.includes('mac-arm64.dmg'));assert(updated.includes('Features.'));assert(updated.includes('macOS 15 or newer'));assert.equal(notes(updated),updated);
});
