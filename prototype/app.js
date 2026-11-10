import React, {useState} from "https://esm.sh/react@18.3.1";
import {createRoot} from "https://esm.sh/react-dom@18.3.1/client?external=react";
import {motion, AnimatePresence} from "https://esm.sh/framer-motion@11.11.17?external=react";
const h=React.createElement;
const works=[
 {title:"Dune : Deuxième partie",year:"2024",type:"Film",poster:"https://image.tmdb.org/t/p/w500/1pdfLvkbY9ohJhCwQH6p0B2gbRb.jpg",desc:"Une aventure spectaculaire dans un univers de science-fiction."},
 {title:"The Batman",year:"2022",type:"Film",poster:"https://image.tmdb.org/t/p/w500/74xTEgt7R36Fpooo50r9T25onhq.jpg",desc:"Une enquête sombre au cœur de Gotham."},
 {title:"Interstellar",year:"2014",type:"Film",poster:"https://image.tmdb.org/t/p/w500/gEU2QniE6E77NI6lCU6Mweb4j6.jpg",desc:"Un voyage au-delà des frontières de notre monde."},
 {title:"Le Jeu de la dame",year:"2020",type:"Série",poster:"https://image.tmdb.org/t/p/w500/34OGjFEbHj0E3lE2w0iTUVq0?x=1",desc:"Une ascension aussi brillante que fragile."},
 {title:"Blade Runner 2049",year:"2017",type:"Film",poster:"https://image.tmdb.org/t/p/w500/gajva2L0rPYkEWjzgFlBXCAVBE5.jpg",desc:"Une fresque de science-fiction contemplative."}
];
function App(){
 const [tab,setTab]=useState("Accueil"),[selected,setSelected]=useState(null);
 const tabs=["Accueil","Bibliothèque","À voir"].map(x=>h("button",{key:x,className:tab===x?"active":"",onClick:()=>setTab(x)},x));
 const cards=works.map((w,i)=>h(motion.article,{className:"movie",key:w.title,layout:true,initial:{opacity:0,y:16},animate:{opacity:1,y:0},transition:{duration:.25,delay:i*.045},whileHover:{y:-5,scale:1.025},whileTap:{scale:.98},onClick:()=>setSelected(w)},
  h("img",{className:"poster",src:w.poster,alt:"",loading:"lazy",onError:e=>{e.currentTarget.style.opacity=.25}}),
  h("div",{className:"movie-copy"},h("h3",null,w.title),h("p",null,w.type+" · "+w.year))
 ));
 const headline=tab==="Accueil"?"Le cinéma, à ton rythme.":tab==="Bibliothèque"?"Ta collection en un regard.":"Tes prochaines découvertes.";
 return h("main",{className:"shell"},
  h("header",{className:"top"},h("div",{className:"brand"},h("div",{className:"logo"},"▶"),h("div",null,h("h1",null,"Aldo Ciné"),h("p",null,"Prototype React + Framer Motion"))),h("span",{className:"tag"},"BRANCHE DE TEST · SANS IMPACT SUR LA PROD")),
  h("nav",{className:"nav"},tabs),
  h(AnimatePresence,{mode:"wait"},h(motion.section,{className:"hero",key:tab,initial:{opacity:0,y:12},animate:{opacity:1,y:0},exit:{opacity:0,y:-8},transition:{duration:.28}},
   h("div",{className:"hero-copy"},h("div",{className:"eyebrow"},"Aldo Ciné · "+tab),h("h2",null,headline),h("p",null,"Un essai limité pour voir ce que React et Framer Motion apportent à l'interface, sans toucher aux données ni aux fonctions de l'application actuelle."),
    h("div",{className:"actions"},h("button",{onClick:()=>setSelected(works[0])},"Voir un exemple"),h("button",{className:"ghost",onClick:()=>setTab("Bibliothèque")},"Explorer la bibliothèque"))
   ))
  ),
  h("div",{className:"section-title"},h("h2",null,"À découvrir"),h("span",{className:"muted"},"Défilement horizontal · cartes interactives")),
  h("div",{className:"rail"},h(AnimatePresence,null,cards)),
  h("p",{className:"hint"},"Test visuel uniquement : les cartes utilisent des exemples et ne modifient pas ta bibliothèque."),
  h(AnimatePresence,null,selected?h(motion.div,{className:"detail",initial:{opacity:0},animate:{opacity:1},exit:{opacity:0},onClick:()=>setSelected(null)},
   h(motion.div,{className:"detail-card",initial:{y:20,scale:.97},animate:{y:0,scale:1},exit:{y:12,scale:.98},onClick:e=>e.stopPropagation()},
    h("div",{className:"eyebrow"},selected.type+" · "+selected.year),h("h2",null,selected.title),h("p",{className:"muted"},selected.desc),h("div",{className:"actions"},h("button",{onClick:()=>setSelected(null)},"Fermer"))
   )
  ):null)
 );
}
createRoot(document.getElementById("root")).render(h(App));