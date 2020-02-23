const fs =require('fs')
const path=require('path')
const parser = require('@babel/parser')
const babel = require('@babel/core')
const traverse = require('@babel/traverse').default
const generator=require('@babel/generator').default
const ejs = require('ejs')

const config = require('./webpack.config') // 导入配置文件
const entry = config.entry // 找到入口文件

let id = 0

// 1.构建AST
const createAst = filePath => {
    const content = fs.readFileSync(filePath, 'utf8') // 读取文件内容

    const ast = parser.parse(content, { // 转换成语法树
        sourceType: 'module'
    })
    // 单个文件的依赖放到一个数组中
    let dependencies = []

    // 单个文件的依赖收集
    // @babel/traverse用来遍历@babel/parser 生成的ast
    traverse(ast, {
        CallExpression(p){
            const node = p.node

            // 对语法树中特定的节点进行操作
            if(node.callee.name === 'require') {
                node.callee.name = '__webpack_require__' // 方法覆写
                let resultPath = node.arguments[0].value
                resultPath = resultPath + (path.extname(resultPath) ? '' : '.js') // 判断是否有后缀名
                dependencies.push(resultPath)
            }
        }
    })

    // 重新生成代码
    let code = generator(ast).code
    let moduleId = id++

    return {
        filePath,
        code,
        dependencies,
        moduleId
    }
}


// 处理多个文件的依赖
const createGraph = entry => {
    const ast = createAst(entry)
    const queue = [ast]

    // 处理绝对路径
    for (const item of queue) {
        const dirname = path.dirname(ast.filePath)
        item.mapping = {}

        item.dependencies.map(relativePath => {
            const absolutePath = path.join(dirname, relativePath)
            const child = createAst(absolutePath)
            item.mapping[relativePath] = child.moduleId
            queue.push(child)
        })
    }

    return queue
}


const modules = createGraph(entry)
const entryId = modules[0].moduleId
let code = []
// 取出执行代码
modules.map((item, index) => {
    const packCode = {
        id: modules[index].mapping,
        code: modules[index].code
    }

    code.push(packCode)
})
let reg = RegExp(/__webpack_require__\((.+?)\)/g)
code = code.map((item, index) => {
    if(item.code.match(reg)){ // 处理code方法名称
        item = item.code.replace(reg, `__webpack_require__(${Object.values(item.id)})`) // 方法名称添加id
    } else {
        item = item.code
    }
    return item
})

// 打包输出

let output = `${config.output.path}\\${config.output.filename}`
let template = fs.readFileSync('./mypack/template.ejs','utf8')

let package = ejs.render(template,{
    entryId,
    code
})
console.log(output)
fs.writeFileSync(output, package)

console.log('success')