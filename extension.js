// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
const vscode = require('vscode');
const path = require('path');

const RemoteMachineProvider = require('./remotesProvider.js').RemoteMachineProvider

const share = require('./share.js')
const fs = require('fs');

// const WebSocket = require('ws');

const dgram = require('dgram');

// const cp = require('child_process')
// const os = require('os');
// const python_exec = os.type()==='Windows_NT'? 'python' : 'python3'
// const os_type = os.type()==='Windows_NT'? 'win' : 'mac'

let g_stats_listen_port = 0



let g_sn = 0 // suffix auto increasement var

let ln = vscode.env.language.includes('zh-cn') ? 1 : 0

function arrayEquals(a, b) {
  return a.length === b.length &&
      a.every((val, index) => val === b[index]);
  
  // return Array.isArray(a) &&
  //     Array.isArray(b) &&
  //     a.length === b.length &&
  //     a.every((val, index) => val === b[index]);
}

function createStatusBarItem(context)
{  
  const myCommandId = 'hyloadExt.statusBarClick';
  context.subscriptions.push(vscode.commands.registerCommand(
    myCommandId, async () => {
    const options = [ 
      ['Plot Load Test Statistics','性能测试数据作图'][ln], 
      ['Plot System Resource Usage','系统资源使用作图'][ln], 
      ['Realtime Monitor','实时监控'][ln], 
    ]
    const selection  = await vscode.window.showQuickPick(
      options,
      { placeHolder: ['Select Hyload Operations','请选择 hyload 相关操作'][ln] });

    // the user canceled the selection
    if (!selection) {
      return;
      }
    
    // the user selected some item. You could use `selection.name` too
    switch (selection) {
      case options[0]: 
        vscode.commands.executeCommand('hyloadExt.plotLoadTestStats');
        break;
      case options[1]: 
        vscode.commands.executeCommand('hyloadExt.plotSysResUsage');
        break;
      case options[2]: 
        vscode.commands.executeCommand('hyloadExt.RealtimeMonitor');
        break;
      //.....
      default:
        break;
    }

  }));

  // create a new status bar item that we can now manage
  const item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  item.command = myCommandId;

  context.subscriptions.push(item);

  item.text = `hyload`;
  // item.tooltip = ['click to show operations',`hyload助手`][ln];
  item.show();
}


// webview panel of stats
let panel_Stats = undefined;
// udp socket to recv messge from the workers
let statsUdpSoket = undefined;

// webview panel of code helper
let panel_CodeHelper = undefined;

let last_textEditor=undefined;
let last_textEditor_file_type=undefined;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed

/**
 * @param {vscode.ExtensionContext} context
 */
async function activate(context) {

  share.g.context = context

  // 设置环境变量
  vscode.commands.executeCommand('setContext', 'hyloadExt.active', true);

  // 启动状态栏图标
  createStatusBarItem(context) ;

  // 修改 workspace 设置， 不显示 __pycache__ 目录
  let cfg = vscode.workspace.getConfiguration()
  cfg.update('files.exclude', {'**/__pycache__':true}, false);

  //load project cfg file 
  share.loadCfgModel() 

  // command - Initialize Hyload Project
  context.subscriptions.push(vscode.commands.registerCommand(
    'hyloadExt.InitHyloadProject', async function () {
        const projectFolderPath = vscode.workspace.workspaceFolders[0].uri.fsPath

        // create hyload configure file       
        share.makeFileSync(path.join(projectFolderPath,'hyload-cfg.json'))

        // create hyload folders
        share.makeDirSync(path.join(projectFolderPath,'code_py'))
        share.makeDirSync(path.join(projectFolderPath,'remotes'))
        share.makeDirSync(path.join(projectFolderPath,'stats_perf'))
        share.makeDirSync(path.join(projectFolderPath,'stats_resource'))
       
        share.makeFileSync(path.join(projectFolderPath,'remotes','vm1.host'))
        
        share.runPythonCmdInNewTerminal('init project','-m pip install hyload -U')

  }));

  

  // command - Add Remost Host
  context.subscriptions.push(vscode.commands.registerCommand(
    'hyloadExt.addRemoteHost', async function (uri) {
      
      const fileName = await vscode.window.showInputBox({
        prompt: "New remote machine name: ",
        placeHolder: "remote machine name"
      });

      if(!fileName)
        return

      const filePath = path.join(uri.fsPath,fileName+'.host')
      // create hyload configure file       
      share.makeFileSync(filePath)

      // 打开文件
      await vscode.commands.executeCommand('vscode.open',vscode.Uri.file(filePath) )
  }));
  
  // command - run hyload
  context.subscriptions.push(vscode.commands.registerCommand(
    'hyloadExt.Run', async function (uri) {
    
    // let stats_filename = new Date().toLocaleString('zh-CN',{ hour12: false }).replace(/:/g,'.').replace(/\//g, '-').replace(/ /g, '_') +  `_${++g_sn}.sts`
    // let statsFilePath = path.join("stats_perf", stats_filename);        
    // let cmd = `"${uri.fsPath}" statsfile="${statsFilePath}"` 
    
    vscode.commands.executeCommand('hyloadExt.RealtimeMonitor');

    setTimeout(() => {
      let cmd = `"${uri.fsPath}"`

      if (g_stats_listen_port > 0)
        cmd += ` console=127.0.0.1:${g_stats_listen_port}`

      share.runPythonCmdInNewTerminal('Run Hyload', cmd)
      
      // if run on remote, we need to specify the stats file name instead of letting worker to decide file name?
      // because data time maybe different in controller machine and worker machine
    }, 
    1000);


  }));

  // command - Realtime Monitor
  context.subscriptions.push(vscode.commands.registerCommand(
    'hyloadExt.RealtimeMonitor', function () {
      
          
    const columnToShowIn = undefined;  

    // If we already have a panel, show it in the target column
    if (panel_Stats) {
      panel_Stats.reveal(columnToShowIn);
      return
    } 

    // Otherwise, create a new panel
    panel_Stats = vscode.window.createWebviewPanel(
      'RealtimeMonitor',
      ['Realtime Monitor','实时监控'][ln],
      columnToShowIn,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        enableCommandUris: true,
        localResourceRoots: [
          vscode.Uri.file(path.join(context.extensionPath, 'webviews'))
        ]
      }
    );
            
    panel_Stats.webview.html = share.getHtmlForWebview(panel_Stats, context, 'monitor.html');


    // when the current panel is closed
    panel_Stats.onDidDispose(
      () => {
        panel_Stats = undefined;
        
        if (statsUdpSoket){
          statsUdpSoket.close();
        }
      },
      null,
      context.subscriptions
    );


    // Handle messages from the webview
    panel_Stats.webview.onDidReceiveMessage(
      message => {
        switch (message.command) {
          case 'alert':
            vscode.window.showErrorMessage(message.text);
            return;
          case 'plot_stats':
            vscode.commands.executeCommand('hyloadExt.plotLoadTestStats')
            return;
          case 'get_listen_port':
            panel_Stats.webview.postMessage({
              type : 'udp_listen_port_open',
              listenPort: g_stats_listen_port
            })
            return;
          case 'stats_hubs_get_cfg_req':
            let stats_hubs = share.g.cfgModel.stats_hubs? share.g.cfgModel.stats_hubs:[]                
            panel_Stats.webview.postMessage({type:'stats_hubs_cfg_data',data:stats_hubs})
            return;
          case 'stats_hubs_updated':
            let newDataFlat = message.hubs.map(h=>h.url)
            let newData = message.hubs    
            
            if (share.g.cfgModel.stats_hubs===undefined){
              share.updateCfgFile('stats_hubs',newData)
              return
            }

            // compare, only save if changed
            let oldDataFlat = share.g.cfgModel.stats_hubs.map(h=>h.url)
            if  (!arrayEquals(oldDataFlat,newDataFlat)){
              share.updateCfgFile('stats_hubs',newData)
              return
            }

        }
      },
      undefined,
      context.subscriptions
    );


    udpSocketSetup(panel_Stats.webview)




  }));

  // var CodeHelperViewProvider = /** @class */ (function () {
  //     function CodeHelperViewProvider(_extensionUri) {
  //         this._extensionUri = _extensionUri;
  //     }

  //     CodeHelperViewProvider.prototype.resolveWebviewView = function (webviewView, context, _token) {
  //         this._view = webviewView;
  //         webviewView.webview.options = {
  //             enableScripts: true
  //         };

  //         webviewView.webview.html = fs.readFileSync(
  //           path.join(context.extensionPath,'webviews','codehelper.html'), 
  //           'utf8'
  //         );

  //         webviewView.webview.onDidReceiveMessage(message => {
  //           switch (message.command) {
  //             case 'alert':
  //               vscode.window.showErrorMessage(message.text);
  //               return;
  //           }
  //         },
  //         undefined,
  //         context.subscriptions);
  //     };
  //     CodeHelperViewProvider.viewType = 'hyload-ab';
  //     return CodeHelperViewProvider;
  // }());

  // context.subscriptions.push(
  //   vscode.window.registerWebviewViewProvider(
  //     "hyloadExt.codeHelperWebView", CodeHelperViewProvider)
  // )



  // command - Code Helper
  context.subscriptions.push(vscode.commands.registerCommand(
    'hyloadExt.CodeHelper', function () {
      
      // refer to 
      const columnToShowIn =  vscode.ViewColumn.Beside;  

      if (panel_CodeHelper) {
        // If we already have a panel, show it in the target column
        panel_CodeHelper.reveal(columnToShowIn);
      } 
      else {
        // Otherwise, create a new panel
        panel_CodeHelper = vscode.window.createWebviewPanel(
          'CodeHelper',
          'Hyload Code Helper',
          columnToShowIn,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            enableCommandUris: true,
            localResourceRoots: [
              vscode.Uri.file(path.join(context.extensionPath, 'webviews'))
            ]
          }
        );
   
        panel_CodeHelper.webview.html = share.getHtmlForWebview(panel_CodeHelper, context, 'codehelper.html');


        // when the current panel is closed
        panel_CodeHelper.onDidDispose(
          () => {
            panel_CodeHelper = undefined;
          },
          null,
          context.subscriptions
        );


        // Handle messages from the webview
        panel_CodeHelper.webview.onDidReceiveMessage(
          async message => {
            switch (message.command) {
              // panel_CodeHelper webview 启动后会发这个消息过来
              // 为的是获取 是否有当前编辑的代码文件可以助手帮助的
              case 'webview_ready':
                  // 如果前面没有获取到正在编辑的可以助手帮助的py文件
                  // 可能是vscode刚刚打开，没有点击过任何的助手帮助的.py文件
                  if (!last_textEditor_file_type) {
                    for (const textEditor of vscode.window.visibleTextEditors) {
                      
                      let uri = textEditor.document.uri.toString()
                      if(uri.startsWith('file:///') && uri.endsWith('.py')){
                        
                        last_textEditor_file_type = uri.includes('/code_py/')? 'code_py' : undefined
                      
                        if (!last_textEditor_file_type) continue
                        
                        // 找到了
                        last_textEditor = textEditor
                        break

                      }
                    } 
                  }

                  if (!last_textEditor_file_type) return

                  panel_CodeHelper.webview.postMessage({            
                      type     : 'activeEditorChanged',
                      fileType : last_textEditor_file_type
                  })
                  return;

              case 'insertCode':
                // let editor = undefined
                // for (const e of vscode.window.visibleTextEditors) {
                //   let uri = e.document.uri.toString()
                //   if(uri.startsWith('file:///') && uri.endsWith('.py')){
                //     editor =  e
                //     break
                //   }
                // } 

                // if (!editor) {
                //   return; // No open text editor
                // }

                if (!last_textEditor) return

                if (last_textEditor.document.isClosed) return

                // await vscode.commands.executeCommand("cursorMove",
                //   {to: "wrappedLineStart"});

                // const position = editor.selection.active;
                // var newPosition = position.with(position.line, 0);
                last_textEditor.insertSnippet(new vscode.SnippetString(message.code))     

                return 

              case 'importHarFile':
                let fileUris = await vscode.window.showOpenDialog({
                  title:['Select HAR file','请选择 HAR 文件'][ln],
                  canSelectMany: false,
                  defaultUri: vscode.workspace.workspaceFolders[0].uri,
                  openLabel: 'OK',
                  filters: {
                    'Har/JSON': ['har','json'],
                    'All files': ['*']
                  }
                })
            
                if (!fileUris) return

                
                let harFile = fileUris[0].fsPath         
                
                let content = fs.readFileSync(harFile, 'utf8');

                let entries = null;

                try {
                    entries = JSON.parse(content).log.entries;     
                }
                catch(error) {
                    vscode.window.showErrorMessage(`HAR file format error \n${error}`);
                    return 
                };    


                let  reqPy = `
# import HAR file, remove unnecessary requests by yourself
def batch1():

    client = HttpClient()`
                for (let  i = 0; i < entries.length; i++ )   {
                    let et = entries[i];
                    let req = et.request;

                        // One request: url.split('//')[1].split('/').slice(1).join('/')
                        
                        reqPy += `
    # Request #${i+1}
    response = client.${req.method.toLowerCase()}(
      '${req.url}',
      headers={
        ${req.headers.filter(h=> !h.name.startsWith(':'))
          .map(h=> `'${h.name}':'${h.value}'`).join(',\n        ')}
      },
      ${req.postData===undefined? "": `data=r'''${req.postData.text}''',`}
    )

`

                }

                if (!last_textEditor) return
                if (last_textEditor.document.isClosed) return
                last_textEditor.insertSnippet(new vscode.SnippetString(reqPy))   

                return;

              case 'alert':
                vscode.window.showErrorMessage(message.text);
                return;
            }
          },
          undefined,
          context.subscriptions
        );



      }


  }));

  
  // command - plot stats
  context.subscriptions.push(vscode.commands.registerCommand(
    'hyloadExt.plotLoadTestStats', async function () {
        
    let fileUris = await vscode.window.showOpenDialog({
      title:['Select Load Test Stats Data File', '请选择压测统计数据文件'][ln],
      canSelectMany: true,
      defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'stats_perf'),
      openLabel: 'OK',
      filters: {
        'Text files': ['sts'],
        'All files': ['*']
      }
    })

    if (!fileUris) return

    let nl = fileUris.map(f => `r'${f.fsPath}'`) .join(',')
    let cmd = `-c "from hyload.tools.plotperf  import ps; ps([${nl}])"`
  
    share.runPythonCmdInTheTerminal('hyload cmds', cmd)

    

  }));

    
  
  // command - plot SysResUsage
  context.subscriptions.push(vscode.commands.registerCommand(
    'hyloadExt.plotSysResUsage', async function () {
        
    let fileUris = await vscode.window.showOpenDialog({
      title:['Select Resource Usage Record File', '请选择资源统计文件'][ln],
      canSelectMany: false,
      defaultUri: vscode.Uri.joinPath(vscode.workspace.workspaceFolders[0].uri, 'stats_resource'),
      openLabel: 'OK',
      filters: {
        'CSV files': ['csv'],
        'All files': ['*']
      }
    })

    if (!fileUris) return

    let statRecordFile = fileUris[0].fsPath
    let cmd = `-c "from hyload.tools.plotresource  import ps; ps(r'${statRecordFile}')"`
  
    share.runPythonCmdInTheTerminal('hyload cmds', cmd)

    

  }));

  // 当前文件编辑改变， 有些非文本编辑窗口（比如 output窗口）激活也会触发该消息
  vscode.window.onDidChangeActiveTextEditor(textEditor=>{
    if (!textEditor) return // 激活的不是文本编辑窗口， 比如点击的codehelper窗口
     
    let uri = textEditor.document.uri.toString()
    // console.log(`changeActive:${uri}`)
    
    if(uri.startsWith('file:///') && uri.endsWith('.py')){

      last_textEditor_file_type = uri.includes('/code_py/')? 'code_py' : 'none'
            
      last_textEditor = last_textEditor_file_type === 'none' ? undefined:textEditor 

      if (!panel_CodeHelper) return

      panel_CodeHelper.webview.postMessage({            
          type     : 'activeEditorChanged',
          fileType : last_textEditor_file_type
      })
      
    }
    
    else{      
      if (!panel_CodeHelper) return

      panel_CodeHelper.webview.postMessage({            
          type     : 'activeEditorChanged',
          fileType : 'none'
      })
    }

       
    
  })

  
  // host file view
  context.subscriptions.push(RemoteMachineProvider.register(context));

  // vscode.window.onDidChangeVisibleTextEditors(textEditor=>{
  //   if (textEditor){
  //     let uri = textEditor.document.uri.toString()
  //     console.log(`changeVisible:${uri}`)     
  //   }
    
  // })

  

}

// this method is called when your extension is deactivated
function deactivate() {}


function udpSocketSetup(webview){

  // launch udp server to receive worker stats data
  statsUdpSoket = dgram.createSocket('udp4');

  // emits when any error occurs
  statsUdpSoket.on('error',function(error){
    console.log('Error: ' + error);
    statsUdpSoket.close();
  });

  statsUdpSoket.on('listening', function() {
    var address = statsUdpSoket.address();
    console.log('udp server for statistics data ' + address.address + ':' + address.port);
    
    g_stats_listen_port = address.port
    
    webview.postMessage({
      type : 'udp_listen_port_open',
      listenPort: address.port
    })

  });

  statsUdpSoket.on('message',
    
    function (msg, remote) {
      
      // console.log('!!! 收到统计请求')  
      if (msg) {      
        webview.postMessage({
          type : 'stats_from_udp',
          stats:msg.toString(),
          remote:remote
        })
      }       
      
  });

  // Zero is to let OS choose a port
  statsUdpSoket.bind(0);

}


module.exports = {
  activate,
  deactivate
}







