import coverPreviews from './book-cover-placeholders.js';
import { initMenu, readPreferences, savePreferences } from './settings-menu.js?v=20261018.1';
// WebP copies and blurred previews come from scripts/optimize-images.py.
const bookArtwork={
  "genesis": "genesis/zilpah.png",
  "exodus": "exodus/jethro.png",
  "leviticus": "leviticus/shelomith.png",
  "numbers": "numbers/balak.png",
  "deuteronomy": "exodus/ithamar.png",
  "joshua": "joshua/othniel.png",
  "judges": "judges/shamgar.png",
  "ruth": "ruth/ruth.png",
  "1-samuel": "1-samuel/samuel-generated.png",
  "2-samuel": "2-samuel/david.png",
  "1-kings": "1-kings/solomon.png",
  "2-kings": "hezekiah-v2.png",
  "1-chronicles": "1-chronicles/asaph-singer.png",
  "2-chronicles": "uzziah-v2.png",
  "ezra": "ezra/ezra.png",
  "nehemiah": "nehemiah/nehemiah.png",
  "esther": "esther/esther.png",
  "job": "job/job.png",
  "psalms": "david-v2.png",
  "proverbs": "proverbs/capable-woman-proverbs.png",
  "ecclesiastes": "ecclesiastes/closing-writer-ecclesiastes.png",
  "song-of-solomon": "song-of-solomon/woman-song.png",
  "isaiah": "isaiah-v2.png",
  "jeremiah": "jeremiah/cover.png",
  "lamentations": "lamentations/grieving-speaker.png",
  "ezekiel": "ezekiel/ezekiel.png",
  "daniel": "daniel/daniel.png",
  "hosea": "hosea/hosea.png",
  "joel": "joel/joel.png",
  "amos": "amos/amos.png",
  "obadiah": "obadiah/obadiah.png",
  "jonah": "jonah/cover.png",
  "micah": "jeremiah/micah-prophet.png",
  "nahum": "nahum/nahum.png",
  "habakkuk": "habakkuk/habakkuk.png",
  "zephaniah": "zephaniah/zephaniah-prophet.png",
  "haggai": "haggai/cover.png",
  "zechariah": "zechariah/cover.png",
  "malachi": "malachi/malachi.png",
  "matthew": "matthew/jesus.png",
  "mark": "matthew/john-baptizer.png",
  "luke": "matthew/mary-mother.png",
  "john": "john/nicodemus.png",
  "acts": "acts/paul.png",
  "romans": "romans/phoebe.png",
  "1-corinthians": "1-corinthians/apollos.png",
  "2-corinthians": "2-corinthians/titus.png",
  "galatians": "acts/barnabas.png",
  "ephesians": "ephesians/tychicus.png",
  "philippians": "philippians/epaphroditus.png",
  "colossians": "colossians/epaphras.png",
  "1-thessalonians": "romans/timothy.png",
  "2-thessalonians": "acts/silas.png",
  "1-timothy": "1-timothy/cover.png",
  "2-timothy": "2-timothy/cover.png",
  "titus": "titus/cover.png",
  "philemon": "philemon/philemon.png",
  "hebrews": "hebrews/cover.png",
  "james": "james/james-letter.png",
  "1-peter": "matthew/peter.png",
  "2-peter": "2-peter/cover.png",
  "1-john": "1-john/cover.png",
  "2-john": "2-john/cover.png",
  "3-john": "3-john/gaius-letter.png",
  "jude": "jude/jude-letter.png",
  "revelation": "revelation/john-vision.png"
};
// The menu sets how each book opens. The reader uses the same choices.
const menu=document.querySelector('#settingsMenu'),preferences={studyMode:'read',perspective:'historical',portraitMode:'generated',...readPreferences()};
function showPreferences(){
  for(const button of menu.querySelectorAll('[data-study-mode],[data-perspective]')){
    const active=button.dataset.studyMode===preferences.studyMode||button.dataset.perspective===preferences.perspective;
    button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));
  }
  menu.querySelector('#nonGeneratedPortraits').checked=preferences.portraitMode==='non-generated';
}
function setPreference(key,value){preferences[key]=value;savePreferences(preferences);showPreferences();if(key==='portraitMode')showCovers();}
initMenu(menu);
menu.addEventListener('click',event=>{
  const mode=event.target.closest('[data-study-mode]'),perspective=event.target.closest('[data-perspective]');
  if(mode)setPreference('studyMode',mode.dataset.studyMode);
  if(perspective)setPreference('perspective',perspective.dataset.perspective);
});
menu.querySelector('#nonGeneratedPortraits').addEventListener('change',event=>setPreference('portraitMode',event.target.checked?'non-generated':'generated'));
showPreferences();
// A book page can change the choices. Show them again when the reader comes back.
addEventListener('pageshow',()=>{const before=preferences.portraitMode;Object.assign(preferences,readPreferences());showPreferences();if(preferences.portraitMode!==before)showCovers();});
const groups=document.querySelector('#bookGroups'),status=document.querySelector('#directoryStatus'),credits=document.querySelector('#coverCredits');
// scripts/build-share.py lists the covers that have licensed old art.
let oldCovers=null,showCovers=()=>{};
async function loadOldCovers(){
  if(oldCovers)return;
  try{const response=await fetch('data/books/directory-covers.json',{cache:'no-store'});oldCovers=response.ok?await response.json():{};}catch{oldCovers={};}
}
try {
  const response=await fetch('data/books/directory.json',{cache:'no-store'});
  if(!response.ok)throw new Error('directory');
  const books=await response.json();
  function render(){
    const old=preferences.portraitMode==='non-generated',credited=[];
    groups.replaceChildren();
    let covers=0;
    for(const testament of ['Old Testament','New Testament']){
      const rows=books.filter(b=>b.testament===testament);if(!rows.length)continue;
      const section=document.createElement('section'),heading=document.createElement('h2'),grid=document.createElement('div');heading.textContent=testament;grid.className='book-grid';section.append(heading,grid);
      for(const book of rows){
        const card=document.createElement('a');
        card.className=`book-card ${book.status}`;
        card.href=book.url;
        // The non-generated setting shows licensed old art. A book without old art shows its name only.
        const generated=book.status==='ready'&&bookArtwork[book.id],licensed=old&&book.status==='ready'&&oldCovers[book.id];
        const artwork=old?licensed&&licensed.src:generated&&`assets/portraits/${generated}`;
        if(licensed)credited.push([book,licensed]);
        if(artwork){
          const image=document.createElement('img'),base=artwork.replace(/\.(png|jpe?g)$/,'');
          image.alt='';
          image.decoding='async';
          // Load the first screen of covers at once. Later covers wait for scrolling.
          if(covers<6)image.fetchPriority='high';
          if(covers++>=18)image.loading='lazy';
          image.addEventListener('load',()=>image.classList.add('loaded'));
          // A missing WebP copy falls back to the master image.
          image.addEventListener('error',()=>{image.removeAttribute('srcset');image.src=artwork;},{once:true});
          image.sizes='(max-width:650px) 50vw, 240px';
          image.srcset=`${base}-480.webp 480w, ${base}.webp 960w`;
          image.src=`${base}-480.webp`;
          // Show a blurred preview until the cover arrives.
          if(!old&&coverPreviews[generated])card.style.backgroundImage=`url("${coverPreviews[generated]}")`;
          card.classList.add('has-artwork');
          card.append(image);
        }
        if(book.status!=='ready'){
          const label=document.createElement('span');
          label.className='book-status';
          label.textContent='Planned';
          card.append(label);
        }
        const title=document.createElement('h3');
        title.textContent=book.name;
        card.append(title);
        grid.append(card);
      }
      groups.append(section);
    }
    // Licensed art keeps its credit and source link.
    credits.replaceChildren();
    credits.hidden=!credited.length;
    for(const [book,art] of credited){
      const line=document.createElement('span'),source=document.createElement('a'),license=document.createElement('a');
      source.href=art.sourceUrl;source.textContent=art.credit;license.href=art.licenseUrl;license.textContent=art.license;
      for(const link of [source,license]){link.target='_blank';link.rel='noopener';}
      line.append(`${book.name} cover: `,source,' · ',license,' · Cropped');
      credits.append(line);
    }

  }
  showCovers=async()=>{if(preferences.portraitMode==='non-generated')await loadOldCovers();render();};
  await showCovers();
}catch{status.hidden=false;status.textContent='The book directory could not load. Reload this page.';}
