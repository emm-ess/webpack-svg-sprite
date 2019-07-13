const path = require('path')
const fs = require('fs')

const globby = require('globby')
const SvgSpriter = require('svg-sprite')
const createHash = require('crypto').createHash

const PLUGIN_NAME = 'webpackSvgSpritePlugin'
const fileRegExp = /\[name\]/
const hashRegExp = /\[hash(?:(?::)([\d]+))?\]/

function ensureTrailingSlash(string) {
    if (string.length && string.substr(-1, 1) !== '/') {
        return `${string}/`;
    }

    return string;
}

class SvgSpritePlugin {
    constructor(options){
        this.options = Object.assign({}, options)
        const path = ensureTrailingSlash(this.options.srcDir)
        this.options.src = `${path}**/*.svg`
        this.options.dest = ensureTrailingSlash(this.options.dest)

        this.startTime = Date.now()
        this.prevTimestamps = {}
        this.needCreateNewFile = true
    }

    // find files based on glob
    async getRelativePaths(context){
        const pattern = this.options.src
        if (globby.hasMagic(pattern)) {
            return await globby(pattern, {
                cwd: context,
                nodir: true
            });
        }
        return pattern
    }

    // format name of css files
    getFileName(filePath, content) {
        if (hashRegExp.test(filePath)) {
            const fileHash = this.hashFile(content)
            const regResult = hashRegExp.exec(filePath)
            const hashLength = regResult[1] ? Number(regResult[1]) : fileHash.length

            filePath = filePath.replace(hashRegExp, fileHash.slice(0, hashLength))
        }
        return filePath.replace(fileRegExp, this.options.name);
    }

    hashFile(content) {
        const { hashFunction = 'md5', hashDigest = 'hex' } = this.options
        let hash = createHash(hashFunction).update(content).digest(hashDigest);
        if (hashDigest === 'base64') {
          // these are not safe url characters.
            hash = hash.replace(/[/+=]/g, (c) => {
                switch (c) {
                    case '/': return '_';
                    case '+': return '-';
                    case '=': return '';
                    default: return c;
                }
            });
        }

        return hash;
    }

    // get absolute Paths
    async resolveInputFiles(compiler){
        const relativePaths = await this.getRelativePaths(compiler.options.context)

        this.inputFiles = await new Promise((resolve, reject) => {
            compiler.resolverFactory.plugin('resolver normal', resolver => {
                resolve(
                    Promise.all(relativePaths.map(relativePath => {
                        return new Promise((resolve, reject) => {
                            resolver.resolve(
                                {},
                                compiler.options.context,
                                relativePath,
                                {},
                                (err, filePath) => {
                                    if (err) {
                                        reject(err);
                                    }
                                    else {
                                        resolve(filePath);
                                    }
                                }
                            )
                        })
                    }))
                )
            })
        })
    }

    // do actual spriting
    async generateSprite(compilation){
        this.cssFiles = []
        const dest = this.options.dest
        const spriter = new SvgSpriter(this.options.config)

        this.inputFiles.forEach((file) => {
            spriter.add(
                file,
                null,
                fs.readFileSync(file, {encoding: 'utf-8'})
            )
        })

        return new Promise((resolve, reject) => {
            spriter.compile((err, result) => {
                if (err) {
                    throw err
                }

                Object.keys(result).forEach((mode) => {
                    Object.keys(result[mode]).forEach((type) => {
                        const data = result[mode][type]
                        const content = data.contents
                        let _path = path.join(dest, path.parse(data.path).base)

                        if (/.css$/.test(_path)) {
                            _path = this.getFileName(_path, content)
                            this.cssFiles.push(_path)
                        }

                        compilation.assets[_path] = {
                            source: () => content,
                            size: () => content.length
                        }
                    })
                })

                resolve()
            })
        })
    }

    // check if compilation is needed
    dependenciesChanged(compilation){
        const fileTimestampsKeys = Object.keys(compilation.fileTimestamps)
        // Since there are no time stamps, assume this is the first run and emit files
        if (!fileTimestampsKeys.length) {
            return true
        }
        const changed = fileTimestampsKeys.filter((watchfile) => {
            const a = (this.prevTimestamps[watchfile] || this.startTime)
            const b = (compilation.fileTimestamps[watchfile] || Infinity)
            return a < b
        }).some(f => this.inputFiles.includes(f))
        this.prevTimestamps = compilation.fileTimestamps
        return changed
    }

    // do compilation if needed
    async processCompiling(compilation, context){
        this.inputFiles.forEach((file) => {
            compilation.fileDependencies.add(path.relative(context, file))
        })
        if (this.dependenciesChanged(compilation)) {
            await this.generateSprite(compilation)
        }
    }

    // webpack hoocks
    async apply(compiler){
        if (compiler.hooks === undefined) {
            throw new Error(
                'webpack-svg-sprite-plugin requires webpack >= 4.'
            )
        }

        let compileLoopStarted = false
        const self = this
        await this.resolveInputFiles(compiler)

        compiler.hooks.emit.tapPromise(PLUGIN_NAME, async (compilation) => {
            if (!compileLoopStarted) {
                compileLoopStarted = true
                await this.processCompiling(compilation, compiler.options.context)
            }
        })
        compiler.hooks.afterEmit.tap(PLUGIN_NAME, () => {
            compileLoopStarted = false
        })
    }
}

module.exports = SvgSpritePlugin
