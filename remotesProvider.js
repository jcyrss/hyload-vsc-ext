const vscode = require('vscode');
const path = require('path');
const fs = require('fs');

const share = require('./share.js')

let ln = vscode.env.language.includes('zh-cn') ? 1 : 0

function remoteCmd(cmd){
  return `
from hyload.tools.remoteop import RemoteOp

ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)
ro.remoteCmd('${cmd}')    
`
}

function code_uploadFileAndUnGz(filePath,remotePath){
  return `
from hyload.tools.remoteop import uploadFileAndUnGz
uploadFileAndUnGz(
  HOST,
  PORT,
  USER, 
  PASSWD,
  SSHKEY,
  r'${filePath}',
  '${remotePath}')    
`
}


function code_uploadFile(filePath,remotePath){
  return `
from hyload.tools.remoteop import uploadFile
uploadFile(
  HOST,
  PORT,
  USER, 
  PASSWD,
  SSHKEY,
  r'${filePath}',
  '${remotePath}')    
`
}


function code_downloadFiles(remoteDir,filesStr,localPath){
  return `from hyload.tools.remoteop import downloadFiles
downloadFiles(
  HOST,
  PORT,
  USER, 
  PASSWD,
  SSHKEY,
  r'${remoteDir}',
  r'${filesStr}',
  r'${localPath}')
`
}


class RemoteMachineProvider {
  static register(context) {
    const provider = new RemoteMachineProvider(context)
    const providerRegistration = vscode.window.registerCustomEditorProvider(
      RemoteMachineProvider.viewType,
      provider,
      {
        supportsMultipleEditorsPerDocument: true,        
      // don't know why , enableScripts does not work here,  
      // you need to specify it in resolveCustomTextEditor below
        webviewOptions:{
          enableScripts: true,
          retainContextWhenHidden: true
        }
      }
    )
    return providerRegistration
  }

  static viewType = "hyloadExt.hostFile"


  constructor(context) {
    this.context = context
  }

  /**
   * Called by vscode when our custom editor is opened.
   *
   */
  async resolveCustomTextEditor(document, webviewPanel, _token) {
    // Setup initial content for the webview
    
    webviewPanel.webview.html = share.getHtmlForWebview(webviewPanel, this.context, 'remotes.html');

    // don't know why , retainContextWhenHidden does not work here,  
    // you need to specify it in registerCustomEditorProvider above.
    webviewPanel.webview.options = {
      enableScripts: true,
      retainContextWhenHidden: true
    }


    function updateWebview() {
      webviewPanel.webview.postMessage({
        command: "fileChangedFromOutside",
        text: document.getText()
      })
    }

    const changeDocumentSubscription = vscode.workspace.onDidChangeTextDocument(
      e => {
        if (e.document.uri.toString() === document.uri.toString()) {
          updateWebview()
        }
      }
    )

    // Make sure we get rid of the listener when our editor is closed.
    webviewPanel.onDidDispose(() => {
      changeDocumentSubscription.dispose()
    })

    // Receive message from the webview.
    webviewPanel.webview.onDidReceiveMessage(e => {
      switch (e.command) {
        case "webview_ready":
          updateWebview()
          return
        case "exec_action":          
          this.execCommand(e.cmd, e.model, webviewPanel)
          return
        case "model_updated":
          this.updateTextDocument(document, e.text)
          return

      }
    })

  }



  /**
   * Write out the data to a given document.
   */
  updateTextDocument(document, data) {
    const edit = new vscode.WorkspaceEdit()

    // Just replace the entire document every time for this extension.
    // A more complete extension should compute minimal edits instead.
    edit.replace(
      document.uri,
      new vscode.Range(0, 0, document.lineCount, 0),
      data
    )

    return vscode.workspace.applyEdit(edit)
  }



  async execCommand(cmd, model, webviewPanel) {

    // model is like this {
    //   host     : '',
    //   sshport  : '22',
    //   username : '',
    //   password : '',
    //   sshprikey : ''
    // }

    
    // function logInfo(data) {
    //   let logwin = document.getElementById("log_window")
    //   logwin.value += data+'\n';
    //   logwin.scrollTop = logwin.scrollHeight;

    // }

    
    function loginInfocheck(){
      if (!(model.username && model.sshport && model.username)){
        vscode.window.showErrorMessage(['Must specify Host, Port, User Name','登录主机、端口、用户名 必须填写'][ln])
        return false
      }
      return true
    }

    async function sshRemoteLogin(cmdArg=undefined){
      let line = `ssh -p ${model.sshport} ${model.username}@${model.host}`
      
      // if (model.sshport !== '22')
      //   line += ':'+model.sshport

      if (cmdArg)
        line += ' ' + cmdArg

      let terminalName = `${model.host}:${model.sshport}>`
      // sshprikey not empty, use sshkey as parameter
      if (model.sshprikey != ''){
        line += ' -i ' + model.sshprikey
        return share.runCmdInNewTerminal(terminalName,line)    
      }        
      else{
        // both sshkey and password are empty, just enter ssh client login command maybe
        // ssh client may use default location sshkey or let use input password
        if (model.password === ''){
          return share.runCmdInNewTerminal(terminalName,line) 
        }
        // sshkey empty, password not empty, use password or default sshkey
        else {
          // Here, if default SSHKEY is set, ssh command will use it anyway.
          // So, in that case, even password is not correct, command line login will be successful.                   
          let terminal =  share.runCmdInNewTerminal(terminalName,line) 
          
          // check login with password
          let ret = await share.runPythonCmdInNewProcess(
            `-c "from hyload.tools.remoteop import *;testSSHConnection_using_password('${model.host}',${model.sshport},'${model.username}','${model.password}')"`)
          if (ret[1].includes('* ssh login ok *')){ 
            terminal.sendText(model.password)
          }
          else{
            // if password not right, let use input password, otherwise, we risk exposing password 
            // return share.runCmdInNewTerminal(terminalName,line) 
            vscode.window.showErrorMessage('The configure password is not correct')
            return undefined
          }

          return terminal
          
        }
      } 
      
    }



    async function runPyCode(pyCode, runEnv='terminal') {

      const projectFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath
      let pyFile = path.join(projectFolderPath,'remoteAction.py');
      
      // console.log(pyCode)
      fs.writeFileSync(pyFile,pyCode);
  
      if (runEnv === 'terminal')
        await share.runPythonCmdInTheTerminal('hyload cmds', `"${pyFile}"`)
      else {
        // run in new headless process
        webviewPanel.webview.postMessage({command: "setInfo", value: ''})        
        let ret = await share.runPythonCmdInNewProcess(`"${pyFile}"`)
        webviewPanel.webview.postMessage({
          command: "setInfo",
          color : ret[0] === 0 ? '' : 'red',
          value: ret[1]})        
      }
    }
    
      
    if (!loginInfocheck()) return

    if (cmd.warning){
      if (await vscode.window.showInformationMessage([`Are you sure to ${cmd.name}?`,`确定 ${cmd.name} 吗？`][ln], "Yes", "No")=='No')
        return    
    }

    let pyCode = `
HOST   = "${model.host}"
PORT   = ${model.sshport}
USER   = "${model.username}"
PASSWD = "${model.password}"  
SSHKEY = "${model.sshprikey}" 
`;  


    if (cmd.code === 'ssh_login') {
      
      sshRemoteLogin()
    }
  
    
    else if (cmd.code === 'gen_ssh_key_pair') {
      share.runCmdInNewTerminal('gen_ssh_key_pair', 'ssh-keygen')
    }
  
    else if (cmd.code === 'install_ssh_public_key') {
      
      let fileUris = await vscode.window.showOpenDialog({
        title:['Select Public Key File', '请选择公钥文件'][ln],
        canSelectMany: false,
        // defaultUri: vscode.Uri.joinPath(process.env.HOME),
        openLabel: 'OK',
        filters: {
          'All files': ['*']
        }
      })
  
      if (!fileUris) return

      let filePath = fileUris[0].fsPath

      let content = fs.readFileSync(filePath,'utf8').trim()

      let cmdline = `ssh ${model.username}@${model.host} "mkdir -p ~/.ssh && echo "${content}" >> ~/.ssh/authorized_keys"`
      share.runCmdInNewTerminal('install SSH public key', cmdline)

//       pyCode +=  `
// from hyload.tools.remoteop import RemoteOp

// ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)
// cmd = '''mkdir -p ~/.ssh && echo "${content}" cat >> ~/.ssh/authorized_keys"'''
// ro.remoteCmd() 
// `
//       runPyCode(pyCode)

    }
  

    else if (cmd.code === 'deploy_hyworker') {


      // let filePath = path.join(this.context.extensionPath,'tools',"hyload_worker.tar.gz") ;

//       pyCode +=  `

// from hyload.tools.remoteop import RemoteOp

// ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)
// ro.remoteCmd('rm -rf hyload_worker.tar.gz hyload_worker/hyload') 


// ` + code_uploadFileAndUnGz(filePath,"hyload_worker.tar.gz")  + `

// ro.remoteCmd('${model.pythonexe} -m pip install gevent') 
// `


      let filePath = path.join(this.context.extensionPath,'tools',"kill_hyload_worker.sh") ;
      pyCode +=  `

from hyload.tools.remoteop import RemoteOp

ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)

ro.remoteCmd('mkdir -p ~/hyload_worker') ` 
+ code_uploadFile(filePath, "hyload_worker/kill_hyload_worker.sh")  + `
ro.remoteCmd('${model.pythonexe} -m pip install hyload') 
`

      runPyCode(pyCode) // 'newprocess'

       // the following commented code's way is wrong, 
      // as runPyCode will return before it's inner runPythonCmdInTheTerminal returns
      // that will cause the 1st runPyCode run the code of the 2nd runPyCode
      
      // let pyCode1 = pyCode + remoteCmd('rm -rf hyload_worker hyload_worker.tar.gz')
      // await runPyCode(pyCode1)

      // let pyCode2 = pyCode + code_uploadFileAndUnGz(filePath,"hyload_worker.tar.gz")
      // await runPyCode(pyCode2)

    }
  
  
    else if (cmd.code === 'upload_loadtest_script') {

      let fileUris = await vscode.window.showOpenDialog({
        title:['Select Files To Upload', '请选择上传文件'][ln],
        canSelectMany: true,
        defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri,'code_py'),
        openLabel: 'OK',
        filters: {
          'Python files': ['py'],
          'All files': ['*']
        }
      })
  
      if (!fileUris) return

      pyCode +=  `

from hyload.tools.remoteop import RemoteOp

ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)
ro.remoteCmd('mkdir -p ~/hyload_worker')

` 
              
      for (let fileUri of fileUris){
        let filePath = fileUri.fsPath

        pyCode += code_uploadFile(
            filePath,
            `hyload_worker/${path.basename(filePath)}`
        )
      }
      
      runPyCode(pyCode, 'newprocess')
    }
  
  
    else if (cmd.code === 'start_loadtest') {
      
  
      //             pyCode  += `            
      // from hyload.tools.remoteop import puttyLogin
      // pa = puttyLogin(HOST,PORT,USER, PASSWD, SSHKEY)    
      // pa.PuttyInputCmd(
      //     'cd hyload_worker'
      // )         
      // pa.PuttyInputString(
      //     'nohup python3 ?1.py tag=loadtest console=192.?:${global.listenPort} statsfile=?.sts &'
      // )         
      // `
      
      webviewPanel.webview.postMessage({
        command: "setInfo",
        value: [`
Remote login, cd 'hyload_worker' directory, execute command like:
  nohup ${model.pythonexe} your-code.py tag=hyloadtest console=monitor-IP:Port &

If remote machine cannnot access monitor machine directly, you need run SWS to relay stats message.
Please refer to the documentation.   
`,
`登录到远程机器，cd 进入部署的 hyload_worker 目录

如果不需要展示实时统计信息，执行如下命令：
  ${model.pythonexe} 性能脚本.py tag=hyloadtest

如果要后台长时间运行， 加上 nohup 和 &， 比如
  nohup  ${model.pythonexe} 性能脚本.py tag=hyloadtest &


如果要展示实时统计信息，
  如果远程主机可以直接访问本机实时监控服务，执行如下命令：
    ${model.pythonexe} 性能脚本.py tag=hyloadtest console=本机地址:统计汇报端口

  如果不能直接访问本机服务，可以启动远程 stats hub websocket server 服务，做法如下：

    确保远程主机防火墙打开端口 28888(tcp) 和 29999(udp)，然后执行如下命令启动 StatsHub：
    ${model.pythonexe} -m hyload.tools.statshub.py --wsport 28888 --recvport 29999 &

    然后，实时监控界面添加该 StatsHub，比如： ws://192.168.5.33:28888， 并连接

    然后执行如下命令：
    ${model.pythonexe} 性能脚本.py tag=hyloadtest console=statsHub地址:29999
`][ln]
      })

      let terminal = await sshRemoteLogin()
      await share.sleep(1000)

      terminal.sendText('cd hyload_worker && ls')
      
    
   
  
    }
  
    else if (cmd.code === 'stop_loadtest') {
      
      pyCode += `            
from hyload.tools.remoteop import RemoteOp
ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)  
ro.remoteCmd(
'cd hyload_worker && chmod +x kill_hyload_worker.sh &&./kill_hyload_worker.sh '
)
`
      runPyCode(pyCode, 'newprocess')
    }
  
  
    else if (cmd.code === 'pull_loadtest_stats') {      
        
      pyCode  += code_downloadFiles(
          'hyload_worker/stats_perf',
          "*.sts",
          path.join(vscode.workspace.workspaceFolders[0].uri.fsPath,'stats_perf')
      )

      runPyCode(pyCode, 'newprocess')
    }
  
    else if (cmd.code === 'plot_perf_stats') {
      vscode.commands.executeCommand('hyloadExt.plotLoadTestStats');
    }
    
  
    else if (cmd.code === 'deploy_system_resource_monitor') {
      
  
      let filePath = path.join(this.context.extensionPath,'tools',"hyload_sysmon.tar.gz") ;

      pyCode +=  `
from hyload.tools.remoteop import RemoteOp

ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)
ro.remoteCmd('rm -rf hyload_sysmon.tar.gz hyload_sysmon/sysmon') 
      
      
      ` + code_uploadFileAndUnGz(filePath,"hyload_sysmon.tar.gz")
      
      runPyCode(pyCode, 'newprocess')

    }
  
  
    else if (cmd.code === 'view_resource_usage') {
      
      
      let terminal = await sshRemoteLogin()      
      await share.sleep(1000)
      
      terminal.sendText(`cd hyload_sysmon && ${model.pythonexe} sysmon/SysInfoDisplay.py`)
    }

  
    else if (cmd.code === 'start_resource_stats') {
      
      pyCode  += `            
from hyload.tools.remoteop import RemoteOp
ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)  
ro.remoteCmd(
'cd hyload_sysmon ; nohup ${model.pythonexe} sysmon/SysInfoRecord.py &> /dev/null&'
)        
ro.remoteCmd(
'cd hyload_sysmon && chmod +x sysmon/*.sh && sysmon/showSysInfoRecord.sh'
)
`
    
      runPyCode(pyCode, 'newprocess')
    }
  
    else if (cmd.code === 'stop_resource_stats') {
      
      pyCode += `            
from hyload.tools.remoteop import RemoteOp
ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)  
ro.remoteCmd(
  'cd hyload_sysmon && chmod +x sysmon/*.sh && sysmon/killSysInfoRecord.sh'
)
`
      runPyCode(pyCode, 'newprocess')
    }
    
  
    else if (cmd.code === 'pull_resource_stats') {
  
      pyCode  += code_downloadFiles(
        'hyload_sysmon',
        "res--*.csv",
        path.join(vscode.workspace.workspaceFolders[0].uri.fsPath,'stats_resource')
      )

      runPyCode(pyCode, 'newprocess')
    }
  
  
  
    else if (cmd.code === 'plot_resource_stats') {     
        
      vscode.commands.executeCommand('hyloadExt.plotSysResUsage');
    }
  
  
  
    else if (cmd.code === 'delete_resource_stats') {
      pyCode  += `            
from hyload.tools.remoteop import RemoteOp
ro = RemoteOp(HOST,PORT,USER, PASSWD, SSHKEY)  
ro.remoteCmd(
'cd hyload_sysmon ; ls res--*.csv ; rm -rf res--*.csv'
)        
`
      runPyCode(pyCode, 'newprocess')

    }
  
  
  }

}

module.exports = {
  RemoteMachineProvider
}