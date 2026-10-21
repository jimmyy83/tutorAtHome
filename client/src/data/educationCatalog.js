const classLevels=[
  {id:'nursery',value:'Nursery',label:'Nursery',stage:'early',active:true,order:0},
  {id:'kindergarten',value:'Kindergarten',label:'Kindergarten',stage:'early',active:true,order:1},
  ...Array.from({length:12},(_,index)=>({id:`class-${index+1}`,value:String(index+1),label:`Class ${index+1}`,stage:index<5?'primary':index<8?'middle':index<10?'secondary':'senior-secondary',active:true,order:index+2})),
];

export const educationCatalogDefaults={
  educationLevels:classLevels,
  streams:[
    {id:'pcm',label:'Science — PCM',description:'Physics, Chemistry and Mathematics.',subjects:['Physics','Chemistry','Mathematics','English','Computer Science','Informatics Practices'],examIds:['jee-main','jee-advanced'],active:true,order:0},
    {id:'pcb',label:'Science — PCB',description:'Physics, Chemistry and Biology.',subjects:['Physics','Chemistry','Biology','English'],examIds:['neet-ug'],active:true,order:1},
    {id:'pcmb',label:'Science — PCMB',description:'Physics, Chemistry, Mathematics and Biology.',subjects:['Physics','Chemistry','Mathematics','Biology','English'],examIds:['jee-main','jee-advanced','neet-ug'],active:true,order:2},
    {id:'commerce',label:'Commerce',description:'Core commerce subjects with board-dependent electives.',subjects:['Accountancy','Business Studies','Economics','English','Mathematics','Applied Mathematics','Informatics Practices'],examIds:[],active:true,order:3},
    {id:'humanities',label:'Humanities / Arts',description:'Humanities subjects vary by board and school.',subjects:['History','Geography','Political Science','Economics','Sociology','Psychology','English','Other board-dependent subject'],examIds:[],active:true,order:4},
  ],
  competitiveExams:[
    {id:'jee-main',label:'JEE Main',description:'Ask about JEE Main preparation.',active:true,order:0},
    {id:'jee-advanced',label:'JEE Advanced',description:'Ask about JEE Advanced preparation.',active:true,order:1},
    {id:'neet-ug',label:'NEET-UG',description:'Ask about NEET-UG preparation.',active:true,order:2},
    {id:'foundation',label:'Foundation preparation',description:'Ask about foundation preparation, where available.',active:true,order:3},
  ],
  subjectsByBoardClass:{},
};
