export default {
    root: './',
    build: { outDir: '../dist'},
    server: {
        proxy: {
            '/chat/hub': {
                target: 'http://localhost:5127',
                ws: true
            },
            '/chat': {
                target: 'http://localhost:5127'
            },
            '/canvas':{
                target: 'http://localhost:5127'
            },
            '/canvas/hub': {
                target: 'http://localhost:5127',
                ws: true
            },
            '/counter': {
                target: 'http://localhost:5127'
            }
        }
    }
}