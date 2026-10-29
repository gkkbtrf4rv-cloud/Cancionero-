(() => {
 const name='cancionero-private-offline-v1';
 window.cancioneroOffline={
  async save(data,user){
   if(!user?.id||!user.approved)throw Error('Inicia sesión con una cuenta autorizada.');
   const snapshot={version:data.version,canciones:data.canciones||[],eventos:data.eventos||[],permission:data.permission||null,savedAt:Date.now(),owner:user.id};
   if(!snapshot.canciones.length)throw Error('No hay canciones para guardar.');
   const cache=await caches.open(name);await cache.put('/__offline_snapshot__/'+encodeURIComponent(user.id),new Response(JSON.stringify(snapshot),{headers:{'Content-Type':'application/json'}}));
   return snapshot;
  },
  async read(user){if(!user?.approved||!user.id)return null;try{const cache=await caches.open(name);const r=await cache.match('/__offline_snapshot__/'+encodeURIComponent(user.id));const d=r?await r.json():null;return d?.owner===user.id?d:null;}catch{return null;}},
  async clear(){await caches.delete(name);}
 };
})();
