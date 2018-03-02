const path = require('path');

const srcPath = './src';
const srcDevPath = './src-dev';
const distPath = './dist';
const devServerPath = './devserver';
const libPath = './lib';
const pkg = require('./package.json');
const pkgPath = `${distPath}/VideoPlayer-${pkg.version}`;

const gulp = require('gulp');
const connect = require('gulp-connect');
const runsequence = require('run-sequence');
const sass = require('gulp-sass');
const sourcemap = require('gulp-sourcemaps');
const postcss = require('gulp-postcss');
const autoprefixer = require('autoprefixer');
const cssnano = require('cssnano');
const gutil = require('gulp-util');
const babel = require('gulp-babel');
const uglify = require('gulp-uglify');
const zip = require('gulp-zip');
const header = require('gulp-header');

const del = require('del');
const argv = require('yargs').argv;
const browserify = require('browserify');
const watchify = require('watchify');
const babelify = require('babelify');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');

function copy(src, dest) {
    return gulp.src(src)
        .pipe( gulp.dest( dest ) );
};

function dateTemplate() {
    return "<%=date.getYear()+1900%>-<%=date.getMonth()+1%>-<%=date.getDate()%> <%=date.getHours()%>:<%=date.getMinutes()%>:<%=date.getSeconds()%>";
};

function bundleJS(dest, _uglify=true) {
    let opts = {
        entries: `${srcPath}/VideoCompoLib.js`,
        debug: true,
    };
    let banner = ['/**',
        ' * @version v<%= version %>',
        ' * @Date <'+dateTemplate()+'>',
        ' * @require jquery: ^3.2.1',
        ' * @require art-template: ^4.12.1',
        ' */',
        ''].join('\n');
    return browserify(opts)
        .transform(babelify)
        .bundle()
        .on('error', gutil.log.bind(gutil, 'be') )
        .pipe( source('VideoCompoLib.js') )
        .pipe( buffer() )
        .pipe( sourcemap.init( { loadMaps:true } ) )
        .pipe( _uglify? uglify() : gutil.noop() )
        .pipe( header( banner, {
            version: pkg.version,
            date: new Date(),
        } ) )
        .pipe( sourcemap.write('./') )
        .pipe( gulp.dest(dest));
}

function compileSass(dest, _compress=true) {
    let postCssPara = [autoprefixer];
    if(_compress){
        postCssPara.push(cssnano({zindex:false}));
    }
    return gulp.src(`${srcPath}/theme.scss`)
        .pipe( sourcemap.init( { loadMaps: true } ) )
        .pipe( sass().on('error', gutil.log.bind(gutil, 'be') ) )
        .pipe( postcss(postCssPara) )
        .pipe( sourcemap.write('./') )
        .pipe( gulp.dest(dest));
}

// 复制指定的theme到src根路径下
gulp.task('preset:theme', ()=>{
    let theme = (argv.t && argv.t !== '')?`${srcPath}/theme/${argv.t}`:`${srcPath}/theme/default`;
    gulp.watch(`${theme}/**/*`, function () {
        copy( `${theme}/**/*`, `${srcPath}` );
    });
    return copy( `${theme}/**/*`, `${srcPath}` );
});

// 启动本地服务
gulp.task('startServer', (cb) => {

    function babelCompile(src, dest) {
        return gulp.src(src)
            .pipe( sourcemap.init( {loadmap:true} ) )
            .pipe( babel() )
            .pipe( sourcemap.write( '.' ) )
            .pipe( gulp.dest(dest) );
    }

    // 先清空 startServer
    gulp.task('startServer:clean', (cb) => {
        del( devServerPath ).then( ()=>cb() );
    });
    // 复制 lib 文件到 devserverpath
    gulp.task('startServer:copyLib', ()=>copy( `${libPath}/**/*`, `${devServerPath}/lib` ));
    // 打包 src 中的JS
    gulp.task('startServer:bundle', ()=>bundleJS(`${devServerPath}`));
    // 编译 src 中的sass
    gulp.task('startServer:sass', ()=>compileSass(`${devServerPath}/css`));
    // 复制src中的其它资源
    gulp.task('startServer:copySrc', ()=>copy([`${srcPath}/**/*`, `!${srcPath}/**/*.js`, `!${srcPath}/sass`, `!${srcPath}/*.scss`], `${devServerPath}`));
    // 编译 src-dev 中的JS
    gulp.task('startServer:bundleSrcDev', ()=>babelCompile(`${srcDevPath}/**/*.js`, `${devServerPath}`));
    // 复制src-dev中的其它资源
    gulp.task('startServer:copySrcDev', ()=>copy([`${srcDevPath}/**/*`, `!${srcDevPath}/**/*.js`], `${devServerPath}`));
    // watch src路径下除了theme文件夹以外的所有JS文件
    gulp.watch([`${srcPath}/**/*.js`, `!${srcPath}/theme/**/*`], ['startServer:bundle']);
    // watch src路径下除了theme文件夹以外的所有scss文件
    gulp.watch([`${srcPath}/**/*.scss`, `!${srcPath}/theme/**/*`], ['startServer:sass']);
    // watch src路径下的其它文件
    gulp.watch([`${srcPath}/**/*`, `!${srcPath}/**/*.js`, `!${srcPath}/sass`, `!${srcPath}/*.scss`], (file)=>{
        let d = path.relative( `${__dirname}/src`, file.path );
        d = d.substring( 0, d.lastIndexOf( path.sep ) );
        copy( file.path, `${devServerPath}/${d}`);
    });
    // watch src-dev 路径下的所有JS文件
    gulp.watch(`${srcDevPath}/**/*.js`, (file)=>{

        let d = path.relative( `${__dirname}/src-dev`, file.path );
        d = d.substring( 0, d.lastIndexOf( path.sep ) );

        babelCompile( file.path, `${devServerPath}/${d}`);
    });
    // watch src-dev 路径下的其它文件
    gulp.watch([`${srcDevPath}/**/*`, `!${srcDevPath}/**/*.js`], (file)=>{

        let d = path.relative( `${__dirname}/src-dev`, file.path );
        d = d.substring( 0, d.lastIndexOf( path.sep ) );
        console.log(d);
        copy( file.path, `${devServerPath}/${d}`);
    })

    // 启动本地服务
    gulp.task('connect', (cb)=>{
        connect.server({
            root: `${devServerPath}`,
            livereload: true
        });

        gulp.watch(`${devServerPath}/**/*`, function () {
            gulp.src( `${devServerPath}/**/*`)
                .pipe( connect.reload() );
        });

        cb();
    });

    runsequence(
        ['preset:theme', 'startServer:clean'],
        ['startServer:copyLib', 'startServer:bundle', 'startServer:sass', 'startServer:copySrc', 'startServer:bundleSrcDev', 'startServer:copySrcDev'],
        ["connect"],
        cb
    );
});

// build
gulp.task('build', (cb)=>{

    // 清理 dist/pkgpath
    gulp.task('build:clean', (cb)=>{
        del(`${pkgPath}/**/*`).then(function () {
            cb();
        });
    });
    // 编译sass文件
    gulp.task('build:sass', ()=>compileSass(`${pkgPath}/css`));
    // 编译JS
    gulp.task('build:bundle', ()=>bundleJS(`${pkgPath}`));
    // 复制其它文件
    gulp.task('build:copy', (cb)=>{

        gulp.task('build:copy:image', ()=>copy( [`${srcPath}/image/**/*`], `${pkgPath}/image`) );
        gulp.task('build:copy:assets', ()=>copy( `${srcPath}/assets/**/*`, `${pkgPath}/assets`) );
        gulp.task('build:copy:videojs', ()=>copy( `./lib/video.js/**/*`, `${pkgPath}/lib/video.js`) );

        runsequence(['build:copy:image', 'build:copy:assets', 'build:copy:videojs'], cb);

    } );
    // 压缩
    gulp.task('build:zip', ()=>{
        return gulp.src( `${pkgPath}/**/*` )
            .pipe( zip( `VideoCompoLib-${pkg.version}.zip`) )
            .pipe( gulp.dest( `${distPath}` ) );
    });

    runsequence(
        ['preset:theme'],
        ['build:clean'],
        ['build:sass', 'build:bundle', 'build:copy'],
        ['build:zip'],
        cb
    )
});
