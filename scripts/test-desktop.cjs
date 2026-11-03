const {spawnSync}=require('node:child_process');
const suites=['sqlite-desktop','paged-libraries','paths','editor-controls','sheet-sharing','pdf-review-zoom','slicing','slice-regressions','page-sizes','dialog','ui','integration','tracing','car-preview','selection','layout','projects','image-prep','trace-refinement','creation','finishing','thickness','review-fixes'];
for(const suite of suites){
  console.log(`Desktop check: ${suite}`);
  const result=spawnSync(process.execPath,[`tests/${suite}.cjs`],{stdio:'inherit',env:process.env});
  if(result.error)throw result.error;
  if(result.status!==0)process.exit(result.status||1);
}
