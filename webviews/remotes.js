
const vscode = acquireVsCodeApi();
let ln = navigator.language.toLowerCase().includes('zh-cn') ? 1 : 0

let modelData = ""
let model = {
  host     : '',
  sshport  : '22',
  username : '',
  password : '',
  sshprikey: '',
  pythonexe: 'python3',
}



window.onload = () => {
  document.getElementById('menu').innerHTML = cmdsToInnerHtml(cmds)
  
  // refer to https://split.js.org
  Split(['#leftpane', '#menu'], {
      sizes: [60, 40],
      minSize: [350,280],
      gutterSize: 5,
      // direction: 'vertical',
  })
  
  updateView()

  vscode.postMessage({command: 'webview_ready'})

};


window.addEventListener('message', event => {

  const message = event.data; 

  switch (message.command) {
    // file content changed from outside
    case 'fileChangedFromOutside':

      if (modelData === message.text) {
        // console.log('not changed')
        return
      }

      if (message.text==='') return

      modelData = message.text
      try{
        let outModel = JSON.parse(modelData)
        let fieldsChanged = false
        for (let [key, value] of Object.entries(model)) {
          if (outModel[key] === undefined) // new field that is not in file
            fieldsChanged = true
          else 
            model[key] = outModel[key]
        }
        // model = {...model, ...outModel}
        updateView()
        if (fieldsChanged){
          let text = JSON.stringify(model, null, 2)
          vscode.postMessage({command: 'model_updated', text:text})
        }
      }
      catch (e){
        console.log(e.name,e.message)
      }
      
      break;
    
    
    case 'setInfo':
      let infoDiv = document.getElementById('info')
      infoDiv.innerHTML = message.value
      infoDiv.style.color = message.color? message.color : '#266783'
      break
  }
});

function updateView(){
  document.getElementById('host').value = model.host
  document.getElementById('sshport').value = model.sshport
  document.getElementById('username').value = model.username
  document.getElementById('password').value = model.password
  document.getElementById('sshprikey').value = model.sshprikey
  document.getElementById('pythonexe').value = model.pythonexe
}

function updateModel(fileld){
  model[fileld] = document.getElementById(fileld).value
  // console.log(model)
  
  let text = JSON.stringify(model, null, 2)
  vscode.postMessage({command: 'model_updated', text:text})
}








function cmdLineClicked(cmd_code){

  let cmd = cmds_Code2Obj[cmd_code]

  
  vscode.postMessage({command: 'exec_action', cmd:cmd, model:model})

}





function cmdsToInnerHtml(cmds){
  return cmds.map((cmd,idx)=>
  cmd === 'separator'?
  `<div class="seperator"></div>`
  :
  `<div class="item" onclick="cmdLineClicked('${cmd.code}')">${cmd.name}</div>`
  ).join('\n')
}


let cmds = [
    {
        name : ['SSH Login', 'SSH 登录'][ln],
        code : `ssh_login`,
        warning : false
    },

    {
        name : ['Generate SSH Key Pair', '生成SSH公私钥'][ln],
        code : `gen_ssh_key_pair`,
        warning : false
    },

    {
        name : ['Install SSH Public Key', '安装SSH公钥到主机'][ln],
        code : `install_ssh_public_key`,
        warning : false
    },

    'separator',
 
    {
        name : ['Deploy System Resource Monitor', '部署系统资源统计工具'][ln],
        code : `deploy_system_resource_monitor`,
        warning : true
    },
    {
        name : ['View Resource Usage', '查看该主机系统资源'][ln],
        code : `view_resource_usage`,
        warning : false
    },
    {
        name : ['Start Resource Stats', '启动资源统计进程'][ln],
        code : `start_resource_stats`,
        warning : true
    },
    {
        name : ['Stop Resource Stats', '停止资源统计进程'][ln],
        code : `stop_resource_stats`,
        warning : true
    },
    {
        name : ['Pull Resource Stats', '获取资源统计数据'][ln],
        code : `pull_resource_stats`,
        warning : false
    },    
    {
        name : ['Delete Resource Stats', '删除远程资源统计数据'][ln],
        code : `delete_resource_stats`,
        warning : true
    },    
    {
        name : ['Plot System Resource Usage', '系统资源统计作图'][ln],
        code : `plot_resource_stats`,
        nowarning : false
    },
    
    'separator',



    {
        name : ['Deploy Hyload Worker', '部署hyload库'][ln],
        code : `deploy_hyworker`,
        warning : true
    },

    {
        name : ['Upload Load Testing Files', '上传压力测试脚本'][ln],
        code : `upload_loadtest_script`,
        warning : false
    },

   
    { 
        name : ['Start Load Testing', '远程运行压力测试'][ln], 
        code : `start_loadtest`,
        warning : true
    },

   
    { 
        name : ['Stop Load Testing', '停止远程压力测试'][ln], 
        code : `stop_loadtest`,
        warning : true
    },


   
    { 
        name : ['Pull Load Testing Stats', '获取压测数据'][ln], 
        code : `pull_loadtest_stats`,
        warning : true
    },
   
    { 
        name : ['Plot Load Testing Stats', '压测数据作图'][ln], 
        code : `plot_perf_stats`,
        warning : false
    },


]


const cmds_Code2Obj = {}

for (let cmd of cmds) {
  if (cmd !== 'separator') cmds_Code2Obj[cmd.code] = cmd
}