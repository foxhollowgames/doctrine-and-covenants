// Shared Wayfinder viewer file. Edit Wayfinder/viewer/native-book.js, then run npm run sync-viewer. Hash 277aefdce769.
import { initBookCrumb } from './breadcrumbs.js?v=20261018.1';
// Every book opens through this entry. The address names the book.
// A book page names its book in data-book. The earlier address names it in the query.
const slug=document.documentElement.dataset.book||new URLSearchParams(location.search).get('book');
if(!slug)location.replace('./');
const directory=await fetch('data/books/directory.json',{cache:'no-store'}).then(r=>r.json());
const book=directory.find(b=>b.id===slug);
if(book)initBookCrumb(document.querySelector('#bookCrumb'),directory.filter(b=>b.status==='ready'||b===book),book);
if(book?.status==='ready'){
  // The page's own title ends with the product name.
  document.title=`${book.name} · ${document.title.split(' · ').pop()||'Bible Wayfinder'}`;
  // Show the address that has this book's share tags.
  if(!document.documentElement.dataset.book)history.replaceState(null,'',`${slug}.html${location.hash}`);
  // Earlier book links used view=map. Preserve these links after the renderer change.
  const hash=new URLSearchParams(location.hash.slice(1));
  if(!hash.has('study')&&hash.get('view')==='map'){hash.set('study','map');location.hash=hash.toString();}
  // Isaiah first saved reader settings under its own keys. Keep those settings.
  const storageKey=`${slug}-native-study-state`,earlierKeys={isaiah:['isaiah-study-guide-state','meridian-state']}[slug]||[];
  try{
    const earlier=earlierKeys.map(key=>localStorage.getItem(key)).find(Boolean);
    if(earlier&&!localStorage.getItem(storageKey))localStorage.setItem(storageKey,earlier);
  }catch{}
  // Previous and Next continue into the neighboring ready books.
  const ready=directory.filter(b=>b.status==='ready'),at=ready.indexOf(book);
  const neighbor=b=>b&&{id:b.id,name:b.name,url:b.url||`${b.id}.html`};
  globalThis.studyBook={id:slug,name:book.name,previousBook:neighbor(ready[at-1]),nextBook:neighbor(ready[at+1])};
  await import('./app.js?v=20261018.1');
}else if(slug){
  document.querySelector('#main').innerHTML=`<section class="word-view"><h1>${book?.name||'Book not found'}</h1><p>This guide has not been built yet.</p><a href="./">Open the directory</a></section>`;
  document.querySelectorAll('.topbar button').forEach(b=>b.disabled=true);
}
