# webpack-svg-sprite-wrapper
A wrapper around [svg-sprite](https://jkphl.github.io/svg-sprite/) for Webpack. 

## Notes
This is a quick'n'dirty Webpack plugin to get an old project (5+ years) to work with a modern bundler. For now, it's only written with having that in mind. I'll bet there are tons of better solution out there. Like [vue-cli-plugin-svg-sprite](https://github.com/swisnl/vue-cli-plugin-svg-sprite) for Vue-based projects.

## Usage
```
// webpack.config.js
const SvgSpritePlugin = require('webpack-svg-sprite-wrapper')

module.exports = {
    plugins: [
        new SvgSpritePlugin({
            name: 'legacySprite',
            srcDir: './legacy/static/img/svg/',
            dest: 'static/img/',
            config: {
                shape: {
                    spacing: {
                        // Add padding
                        padding: 3,
                    },
                },
                mode: {
                    // Activate the «view» mode
                    view: {
                        sprite: 'legacy-sprite.svg',
                        bust: true,
                        render: {
                            // Activate CSS output (with default options)
                            css: {dest: '[name].css'},
                        },
                    },
                    // Activate the «symbol» mode
                    symbol: false,
                },
            },
        }),
    ]
}
```

[Other configuration options](https://github.com/jkphl/svg-sprite/blob/master/docs/configuration.md)
