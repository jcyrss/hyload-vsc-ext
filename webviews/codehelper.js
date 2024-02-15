
const vscode = acquireVsCodeApi();
let ln = navigator.language.toLowerCase().includes('zh-cn') ? 1 : 0

vscode.postMessage({command: 'webview_ready'})

window.addEventListener('message', event => {

  const message = event.data; // The JSON data our extension sent

  switch (message.type) {
    case 'activeEditorChanged':

      if (g_menu_type == message.fileType) break   

      // g_menu_type = message.fileType === 'none' ? 'none' : 'code_helper'
      // console.log(`set Helper Menus : ${g_menu_type}`)

      g_menu_type = 'code_helper'
      document.getElementById('menu').innerHTML = g_menus[g_menu_type].html  
        
      break;

  }
});


var g_menu_type = 'code_helper' // 'none'

function menuClicked(menuName){
  let cmds = g_menus[g_menu_type].cmds

  theCmd = null;
  for (let cmd of cmds) {
    if ( cmd === 'separator') continue

    if (cmd.name === menuName){
      theCmd = cmd
      break
    }
  }

  if (theCmd.hasOwnProperty('code'))
    vscode.postMessage({
        command: 'insertCode',
        code: theCmd.code
        })
  else if (theCmd.hasOwnProperty('func')){
    theCmd.func()
  }
}



// const menuItems = document.querySelectorAll(".menu .item");

// for (let i = 0; i < menuItems.length; i++) {
//   let item = menuItems[i]
//   item.addEventListener("click", function() {                
//     vscode.postMessage({
//       command: 'insertCode',
//       code: name2code[item.getAttribute('name')]
//     })
//   });
// }

function cmdsToInnerHtml(cmds){
  return cmds.map((cmd,idx)=>
    cmd === 'separator'?
    `<div class="seperator"></div>`
    :
    `<div class="item" onclick="menuClicked('${cmd.name}')">${cmd.name}</div>`
  ).join('\n')
}

function cmd_action_loadHAR(){
    if(!files) return null;
}

let code_helper_cmds = [
   
  {
      name : ['Code Template - Interface Test', '代码模板 - 接口调试'][ln],
      code : `from hyload import *

client = HttpClient() 
                   
print('Msg #1 - login >>>')
response = client.post(
    'http://127.0.0.1/api/mgr/signin',
    # HTTP body of x-www-form-urlencoded format
    data={
        'username':'byhy',
        'password':'88888888'
    },
    debug = True # to print HTTP message
)

print('Msg #2 - list_customer >>>')
response = client.get(
    '/api/mgr/customers?action=list_customer',
    debug = True
)
`
  },
      

    {
        name : ['Code Template - Load Test 1', '代码模板 - 性能测试1'][ln],
        code : `from hyload import *

Stats.start() # to show stats on console and GUI.

#  ---------- define testing below   ----------

# User behavior function
def behavior1(username,password): 

    client = HttpClient() 

    # API login
    response = client.post('http://127.0.0.1/api/mgr/signin',
        data={'username':username,'password':password})
        
    sleep(1)

    for i in range(10):
        # send API list customers
        response = client.get('/api/mgr/customers?action=list_customer')
        
        # check response
        try:
            respObj = response.json()
        except:
            # if anything wrong, put it into stats and logs
            Stats.one_error('list_customer response.json() error')
            continue

        if (respObj['ret'] != 0):        
            Stats.one_error('list_customer respObj[ret] error')

        sleep(1)

# emulate 10 user's behavior of the same type
for i in range(10): 
    username=f'byhy_{i:04}'
    # run user behavior function in hyload task (a greenlet)
    run_task(behavior1, username, '88888888')
    sleep(1) 

# wait for all hyload tasks to end
wait_for_tasks_done()
`
    },
    

    {
        name : ['Code Template - Load Test 2', '代码模板 - 性能测试2'][ln],
        code : `from hyload import *

Stats.start() # to show stats on console and GUI.

#  ---------- define testing below   ----------

# User behavior class
class VUser:
    def __init__(self,username):
        self.client = HttpClient()
        self.username = username

    # entry method
    def behavior(self):
    
        # open home page
        self.static_resource('http://127.0.0.1', 301)
        self.static_resource('/cdnjs/jquery/jquery.min.js')
        sleep(2)
    
        # open login page
        self.static_resource( '/mgr/sign.html')
        sleep(2)
    
        # login
        response = self.client.post('http://127.0.0.1/api/mgr/signin',
            data={'username':'byhy','password':'88888888'})
        
        # check respose
        if (response.json()['ret'] != 0):            
            Stats.one_error('login error') # put error info into stats and logs
            return
            
        # show the page after login
        self.static_resource( '/mgr/')
        sleep(2)
       
    # method to open static page
    def static_resource(self,url,statusCode=200):
        response = self.client.get(url)
    
        #  check status code
        if (response.status_code != statusCode):
            Stats.one_error(f'{url} error {response.status_code}')
        

# emulate 10 user's behavior of the same type
for i in range(10):
    username = f'user{i:06}'
    vuser = VUser(username)
    
    # run user behavior function in hyload task (a greenlet)
    run_task(vuser.behavior)
    sleep(1) 

# wait for all hyload tasks to end
wait_for_tasks_done()
`
    },

     
    // {
    //     name : '编程接口说明',
    //     func : (guiObj)=>{
    //         execSync('start http://www.byhy.net/tut/others/loadtest/interface/') 
    //     }
    // },
    
    'separator',


    {
      name : ['Create a HTTP client', '创建 HTTP 客户端'][ln],
      code : `client = HttpClient(
    timeout = 10,   # in seconds
    proxy   = None  # proxy, like 127.0.0.1:8888
) 
`
    },


    {
        name : ['Send a simple request', '发送 简单请求'][ln],
        code : `# The first request must specify protocol, host, port. 
# Those are not necessary for the following requests          
response = client.get('http://127.0.0.1/api/path1')
`
    },

    {
        name : ['Send a request, set url parameters', '发送请求，设置 url参数'][ln],
        code : `response = client.get(
    'http://127.0.0.1/api/path1', 
    # specify url paramters
    params={
        'param1':'value1',
        'param2':'value2'
    },
)
`
    },

    {
        name : ['Send a request, set HTTP header', '发送请求，设置 消息头'][ln],
        code : `response = client.get(
    'http://127.0.0.1/api/path1',
    # specify HTTP headers
    headers={
        'header1':'value1',
        'header2':'value2'
    },
)
`
    },
    
    {
        name : ['Send a request, set HTTP body in urlencoded format', '发送请求，设置 消息体，urlencode 格式'][ln],
        code : `response = client.post(
    'http://127.0.0.1/api/path1',
    # specify HTTP body in urlencode format
    data={
        'param1':'value1',
        'param2':'value2'
    },
)
`
    },

    {
        name : ['Send a request, set HTTP body in JSON format', '发送请求，设置 消息体，JSON 格式'][ln],
        code : `response = client.post(
    'http://127.0.0.1/api/path1',
    # specify HTTP body in json format
    json={
        'param1':'value1',
        'param2':'value2'
    },
)
`
    },

    {
        name : ['Send a request, set HTTP body with string', '发送请求，设置 消息体，直接写入字符串'][ln],
        code : `response = client.post(
    'http://127.0.0.1/api/path1',
    headers={
        'Content-Type':'application/xml; charset=utf-8'
    },
    # specify HTTP body directly by string
    # encoding is set by param 'request_body_encoding', 'utf8' by default
    data='''<?xml version="1.0" encoding="UTF-8"?>
<CreateBucketConfiguration>
    <StorageClass>Standard</StorageClass>
</CreateBucketConfiguration>''',
)
`
    },

    {
        name : ['Send a request, set HTTP body with bytes', '发送请求，设置 消息体，直接写入 字节'][ln],
        code : `response = client.post(
    'http://127.0.0.1/api/uploadpng',
    headers={
        'Content-Type':'image/png'
    },
    # specify HTTP body directly by bytes
    data=b'''\\x89PNG\\r\\n\\x1a\\n''',
)
`
    },



    {
        name : ['Send multiple requests in loop', '循环发10个请求'][ln],
        code : `for i in range(10): 
    response = client.get('http://127.0.0.1/api/path1')
    sleep(1) # interval is 1 second
`
    },

    
    'separator',


    {
        name : ['Get timeout of response', '响应 时长 (单位 : 毫秒)'][ln],
        code : `response.response_time`
    },

    {
        name : ['Get status code of response', '响应 状态码'][ln],
        code : `response.status_code`
    },

    {
        name : ['Get string body of response', '响应 消息体文本'][ln],
        code : `response.text`
    },


    {
        name : ['Get bytes body of response', '响应 消息体字节'][ln],
        code : `response.content`
    },

    {
        name : ['Get Python object from JSON response body', '响应JSON消息体 转为 Python对象'][ln],
        code : `response.json()`
    },



    {
        name : ['Get specified reponse header', '获取某个响应 消息头'][ln],
        code : `response.headers['Content-Type']`
    },


    {
        name : ['Print all reponse headers', '显示所有响应 消息头'][ln],
        code : `print(response.headers)
`
    },



    'separator',
    
    {
        name : ['Record one error during test', '报告一个错误'][ln],
        code : `Stats.one_error("${['error info', '记录到日志的信息'][ln]}")
`
    },    

    {
        name : ['Write something into log file', '写入日志文件'][ln],
        code : `TestLogger.write("${['log info', '这里写日志信息'][ln]}")
`
    },

    'separator',

    {
        name : ['Wait 10 seconds', '等待10秒'][ln],
        code : `sleep(10)`
    },
    

    'separator',
    
    {
        name : ['Import HAR file', '导入HAR'][ln],
        func : ()=>{
            vscode.postMessage({
            command: 'importHarFile'
        })}
    },
]



let g_menus = {
  'code_helper' : {
    cmds: code_helper_cmds,
    html : cmdsToInnerHtml(code_helper_cmds)
  },
  'none' : {
    cmds: [],
    html : `<div style="text-align: center;">Code Helper Not Applicable Here</div>`
  },

}
