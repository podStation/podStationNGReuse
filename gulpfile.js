var gulp = require('gulp');
var concat = require('gulp-concat');  
var rename = require('gulp-rename');  
var uglify = require('gulp-uglify');  

var jsFiles = 'src/**/*.js';
var jsDest = 'dist';

gulp.task('dist', function() {  
	return gulp.src(jsFiles)
	       .pipe(concat('podStationNGReuse.js'))
	       .pipe(gulp.dest(jsDest))
	       .pipe(rename('podStationNGReuse.min.js'))
	       .pipe(uglify())
	       .pipe(gulp.dest(jsDest));
});