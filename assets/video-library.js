(function(){
  const key='nono-video-links-v2';
  const legacyKey='nono-video-links-v1';
  const defaults={
    vlog:[
      {id:'builtin-vlog-1',url:'https://www.bilibili.com/video/BV1v97U6GEH6/',name:"Nono's Vlog.1",date:'2026.06.06',cover:'assets/video/nono-vlog-1.jpg'},
      {id:'builtin-vlog-2',url:'https://www.bilibili.com/video/BV1L4pY6VEpe/',name:'《下一个是谁》Reaction · 第四季第一期',date:'2026.10.10',cover:'assets/video/reaction-episode-1.jpg'}
    ],
    dancee:[]
  };

  function migrate(){
    let legacy={vlog:[],dancee:[]};
    try{legacy=JSON.parse(localStorage.getItem(legacyKey))||legacy}catch{}
    const byUrl=new Map(defaults.vlog.map(item=>[item.url.split('?')[0].replace(/\/$/,''),item]));
    (Array.isArray(legacy.vlog)?legacy.vlog:[]).forEach(item=>{
      const url=String(item.url||'').split('?')[0].replace(/\/$/,''),previous=byUrl.get(url)||{};
      byUrl.set(url,{...previous,...item});
    });
    return {vlog:[...byUrl.values()],dancee:Array.isArray(legacy.dancee)?legacy.dancee:[]};
  }

  function read(){
    let data;
    try{data=JSON.parse(localStorage.getItem(key))}catch{}
    if(!data||typeof data!=='object'||Array.isArray(data)||!Array.isArray(data.vlog)||!Array.isArray(data.dancee)){data=migrate();write(data)}
    data.vlog=Array.isArray(data.vlog)?data.vlog:[];
    data.dancee=Array.isArray(data.dancee)?data.dancee:[];
    let changed=false;
    ['vlog','dancee'].forEach(category=>data[category].forEach(item=>{
      if(!item.id){item.id=`${Date.now()}-${Math.random().toString(36).slice(2)}`;changed=true}
    }));
    if(changed)write(data);
    try{localStorage.removeItem(legacyKey)}catch{}
    return data;
  }

  function write(data){localStorage.setItem(key,JSON.stringify(data))}

  function add(category,item){
    const data=read();
    data[category].unshift({id:`${Date.now()}-${Math.random().toString(36).slice(2)}`,...item});
    write(data);
  }

  function remove(category,id){
    const data=read();
    data[category]=data[category].filter(item=>item.id!==id);
    write(data);
  }

  function setCover(category,id,cover){
    const data=read(),item=data[category].find(entry=>entry.id===id);
    if(item){item.cover=cover;write(data)}
  }

  function isDouyin(url){return /(^|\.)douyin\.com$/i.test(new URL(url).hostname)}

  function coverFromFile(file){
    return new Promise((resolve,reject)=>{
      if(!file?.type.startsWith('image/'))return reject(new Error('请选择图片文件'));
      const image=new Image(),reader=new FileReader();
      reader.onerror=()=>reject(new Error('图片读取失败'));
      reader.onload=()=>{image.src=reader.result};
      image.onerror=()=>reject(new Error('图片无法打开'));
      image.onload=()=>{
        const scale=Math.min(1,1200/image.width),canvas=document.createElement('canvas');
        canvas.width=Math.round(image.width*scale);canvas.height=Math.round(image.height*scale);
        canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
        resolve(canvas.toDataURL('image/jpeg',.82));
      };
      reader.readAsDataURL(file);
    });
  }

  function pickCover(){
    return new Promise(resolve=>{
      const input=document.createElement('input');input.type='file';input.accept='image/*';
      input.onchange=()=>input.files[0]?coverFromFile(input.files[0]).then(resolve).catch(()=>resolve('')):resolve('');
      input.click();
    });
  }

  function bilibiliId(url){return url.match(/BV[a-zA-Z0-9]{10}/)?.[0]||''}

  function enrich(category,item){
    const bvid=bilibiliId(item.url);
    if(!bvid||item.cover)return Promise.resolve(item);
    return new Promise(resolve=>{
      const callback=`biliMeta_${Date.now()}_${Math.random().toString(36).slice(2)}`;
      const script=document.createElement('script');
      const finish=updated=>{delete window[callback];script.remove();resolve(updated)};
      const timer=setTimeout(()=>finish(item),8000);
      window[callback]=response=>{
        clearTimeout(timer);
        if(response?.code!==0)return finish(item);
        const updated={...item,cover:response.data.pic.replace(/^http:/,'https:'),autoName:response.data.title,date:new Date(response.data.pubdate*1000).toLocaleDateString('zh-CN').replaceAll('/','.')};
        const data=read();
        const index=data[category].findIndex(entry=>entry.id===item.id);
        if(index>=0){data[category][index]=updated;write(data)}
        finish(updated);
      };
      script.onerror=()=>{clearTimeout(timer);finish(item)};
      script.src=`https://api.bilibili.com/x/web-interface/view?bvid=${bvid}&jsonp=jsonp&callback=${callback}`;
      document.head.append(script);
    });
  }

  window.VideoLibrary={read,add,remove,setCover,isDouyin,coverFromFile,pickCover,enrich};
})();
