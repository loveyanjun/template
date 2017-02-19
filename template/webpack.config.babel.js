import webpack from 'webpack'
import CopyWebpackPlugin from 'copy-webpack-plugin'
import ExtractTextPlugin from 'extract-text-webpack-plugin'
import HtmlWebpackPlugin from 'html-webpack-plugin'
import FaviconsWebpackPlugin from 'favicons-webpack-plugin'
import config, { paths } from './config'

const { __DEV__, __PROD__, __TEST__ } = config.globals
const debug = require('debug')('PLATO:webpack')

debug('Create configuration.')

const webpackConfig = {
  target: 'web',
  resolve: {
    modules: [paths.src(), 'node_modules'],
    extensions: ['.css', '.js', '.json', '.vue'],
    alias: {}
  },
  node: {
    fs: 'empty',
    net: 'empty'
  },
  devtool: config.compiler_devtool,
  devServer: {
    host: config.server_host,
    port: config.server_port,
    // proxy is useful for debugging
    // proxy: [{
    //   context: '/api',
    //   target: 'http://localhost:3001',
    //   pathRewrite: {
    //     '^/api': '' // Host path & target path conversion
    //   }
    // }],
    compress: true,
    hot: true,
    noInfo: true
  },
  entry: {
    app: [
      // 加载 polyfills
      paths.src('polyfills/index.js'),
      paths.src('index.js')],
    plato: [
      // from platojs
      'vue',
      'vue-router',
      'vuex',
      'vuex-router-sync',
      // from local deps
      {{#persist}}
      'vuex-localstorage',
      {{/persist}}
      'vuex-actions'
    ]
  },
  output: {
    path: paths.dist(),
    publicPath: config.compiler_public_path,
    filename: `[name].[${config.compiler_hash_type}].js`,
    chunkFilename: `[id].[${config.compiler_hash_type}].js`
  },
  performance: {
    hints: __PROD__ ? 'warning' : false
  },
  module: {
    rules: [
      {
        test: /\.(js|vue)$/,
        exclude: /node_modules/,
        loader: 'eslint-loader',
        options: {
          emitWarning: __DEV__,
          formatter: require('eslint-friendly-formatter')
        },
        enforce: 'pre'
      },
      {
        test: /\.vue$/,
        loader: 'vue-loader',
        options: {
          loaders: {
            css: __PROD__ ? ExtractTextPlugin.extract({
              use: 'css-loader?sourceMap',
              fallback: 'vue-style-loader'
            }) : 'vue-style-loader!css-loader?sourceMap',
            js: 'babel-loader'
          }
        }
      },
      {
        test: /\.js$/,
        // platojs 模块需要 babel 处理
        exclude: /node_modules[/\\](?!platojs)/,
        loader: 'babel-loader'
      },
      {
        test: /\.html$/,
        loader: 'vue-html-loader'
      },
      {
        test: /@[1-3]x\S*\.(png|jpg|gif)(\?.*)?$/,
        loader: 'file-loader',
        options: {
          name: '[name].[ext]?[hash:7]'
        }
      },
      {
        test: /\.(png|jpg|gif|svg|woff2?|eot|ttf)(\?.*)?$/,
        exclude: /@[1-3]x/, // skip encoding @1x/@2x/@3x images with base64
        loader: 'url-loader',
        options: {
          limit: 10000,
          name: '[name].[ext]?[hash:7]'
        }
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin(config.globals),
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: paths.src('index.ejs'),
      title: `${config.pkg.name} - ${config.pkg.description}`,
      hash: false,
      inject: true,
      minify: {
        collapseWhitespace: config.compiler_html_minify,
        minifyJS: config.compiler_html_minify
      }
    }),
    new CopyWebpackPlugin([{
      from: paths.src('static')
    }], {
      ignore: ['README.md']
    })
  ]
}

// ------------------------------------
// Plugins
// ------------------------------------

const vueLoaderOptions = {
  postcss: pack => {
    return [
      require('postcss-import')({
        path: paths.src('application/styles')
      }),
      require('postcss-url')({
        basePath: paths.src('static')
      }),
      require('postcss-cssnext')({
        // see: https://github.com/ai/browserslist#queries
        {{#mobile}}
        browsers: 'Android >= 4, iOS >= 7',
        {{else}}
        browsers: 'IE >= 9, Chrome >= 50',
        {{/mobile}}
        features: {
          customProperties: {
            variables: require(paths.src('application/styles/variables'))
          }
        }
      }),
      require('postcss-flexible')({
        {{#mobile}}
        {{else}}
        desktop: true,
        {{/mobile}}
        remUnit: 75
      }),
      {{#i18n}}
      // PostCSS plugin for RTL-optimizations
      require('postcss-rtl')({
        // Custom function for adding prefix to selector. Optional.
        addPrefixToSelector (selector, prefix) {
          if (/^html/.test(selector)) {
            return selector.replace(/^html/, `html${prefix}`)
          }
          if (/:root/.test(selector)) {
            return selector.replace(/:root/, `${prefix}:root`)
          }
          // compliant with postcss-flexible
          if (/^\[data-dpr(="[1-3]")?]/.test(selector)) {
            return `${prefix}${selector}`
          }
          return `${prefix} ${selector}`
        }
      }),
      {{/i18n}}
      require('postcss-browser-reporter')(),
      require('postcss-reporter')()
    ]
  },
  autoprefixer: false
}

if (__PROD__) {
  debug('Enable plugins for production (Dedupe & UglifyJS).')
  webpackConfig.plugins.push(
    new webpack.LoaderOptionsPlugin({
      minimize: true,
      options: {
        context: __dirname
      },
      vue: vueLoaderOptions
    }),
    new webpack.optimize.UglifyJsPlugin({
      compress: {
        unused: true,
        dead_code: true,
        warnings: false
      },
      sourceMap: true
    }),
    // extract css into its own file
    new ExtractTextPlugin('[name].[contenthash].css')
  )
} else {
  debug('Enable plugins for live development (HMR, NoErrors).')
  webpackConfig.plugins.push(
    new webpack.HotModuleReplacementPlugin(),
    new webpack.NoEmitOnErrorsPlugin(),
    new webpack.LoaderOptionsPlugin({
      debug: true,
      options: {
        context: __dirname
      },
      vue: vueLoaderOptions
    })
  )
}

// Don't split bundles during testing, since we only want import one bundle
if (!__TEST__) {
  webpackConfig.plugins.push(
    new FaviconsWebpackPlugin({
      logo: paths.src('assets/logo.svg'),
      prefix: 'icons-[hash:7]/',
      {{#mobile}}
      icons: {
        android: true,
        appleIcon: true,
        appleStartup: true,
        coast: false,
        favicons: true,
        firefox: false,
        opengraph: false,
        twitter: false,
        yandex: false,
        windows: false
      }
      {{else}}
      icons: {
        android: false,
        appleIcon: false,
        appleStartup: false,
        coast: false,
        favicons: true,
        firefox: true,
        opengraph: false,
        twitter: false,
        yandex: false,
        windows: true
      }
      {{/mobile}}
    }),
    new webpack.optimize.CommonsChunkPlugin({
      names: ['plato']
    })
  )
}

export default webpackConfig
