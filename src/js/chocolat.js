export const defaults = {
    container: window, // window or jquery object or jquery selector, or element
    imageSelector: '.chocolat-image',
    className: '',
    imageSize: 'default', // 'default', 'contain', 'cover' or 'native'
    initialZoomState: null,
    fullScreen: false,
    loop: false,
    linkImages: true,
    duration: 300,
    setTitle: '',
    separator2: '/',
    setIndex: 0,
    firstImage: 0,
    lastImage: false,
    currentImage: false,
    initialized: false,
    timer: false,
    timerDebounce: false,
    images: [],
    enableZoom: true,
    imageSource: 'href',
    afterInitialize() {},
    afterMarkup() {},
    afterImageLoad() {},
    zoomedPaddingX: function(canvasWidth, imgWidth) {
        return 0
    },
    zoomedPaddingY: function(canvasHeight, imgHeight) {
        return 0
    },
}

export class Chocolat {
    constructor(element, settings) {
        this.settings = settings
        this.elems = {}
        this.$element = $(element)
        this.element = this.$element[0]
        this.events = []

        this._cssClasses = [
            'chocolat-open',
            'chocolat-in-container',
            'chocolat-cover',
            'chocolat-zoomable',
            'chocolat-zoomed',
        ]

        if (!this.settings.setTitle && this.element.dataset['chocolat-title']) {
            this.settings.setTitle = this.element.dataset['chocolat-title']
        }

        const imgs = this.element.querySelectorAll(this.settings.imageSelector)

        imgs.forEach((el, i) => {
            this.settings.images.push({
                title: el.getAttribute('title'),
                src: el.getAttribute(this.settings.imageSource),
                height: false,
                width: false,
            })

            this.off(el, 'click.chocolat')
            this.on(el, 'click.chocolat', (e) => {
                this.init(i)
                e.preventDefault()
            })
        })
    }

    on(element, eventName, cb) {
        const length = this.events.push({
            element,
            eventName,
            cb,
        })
        element.addEventListener(eventName.split('.')[0], this.events[length - 1].cb)
        return this
    }

    off(element, eventName) {
        const index = this.events.findIndex((event) => {
            return event.element === element && event.eventName === eventName
        })

        if (this.events[index]) {
            element.removeEventListener(eventName.split('.')[0], this.events[index].cb)
            this.events.splice(index, 1)
        }

        return this
    }

    init(i) {
        if (!this.settings.initialized) {
            this.setDomContainer()
            this.markup()
            this.attachListeners()
            this.settings.lastImage = this.settings.images.length - 1
            this.settings.initialized = true
        }

        this.settings.afterInitialize.call(this)

        return this.load(i)
    }

    preload(i) {
        const src = this.settings.images[i].src
        let image = new Image()
        if ('decode' in image) {
            image.src = src
            return new Promise(function(resolve, reject) {
                image
                    .decode()
                    .then(resolve.bind(this, image))
                    .catch(resolve)
            })
        } else {
            return new Promise(function(resolve, reject) {
                image.onload = resolve.bind(this, image)
                image.onerror = resolve
                image.src = src
            })
        }
    }

    load(i) {
        if (this.settings.fullScreen) {
            this.openFullScreen()
        }

        if (this.settings.currentImage === i) {
            return
        }

        $(this.elems.overlay).fadeIn(this.settings.duration)
        $(this.elems.wrapper).fadeIn(this.settings.duration)
        this.elems.domContainer.addClass('chocolat-open')

        this.settings.timer = setTimeout(() => {
            if (typeof this.elems != 'undefined') {
                $(this.elems.loader).fadeIn()
            }
        }, this.settings.duration)

        return this.preload(i)
            .then((imgLoader) => {
                const nextIndex = i + 1
                if (this.settings.images[nextIndex] != undefined) {
                    this.preload(nextIndex)
                }

                return this.place(i, imgLoader)
            })
            .then((imgLoader) => {
                return this.appear(i)
            })
            .then((imgLoader) => {
                this.zoomable()
                this.settings.afterImageLoad()
            })
    }

    place(i, imgLoader) {
        var fitting

        this.settings.currentImage = i
        this.description()
        this.pagination()
        this.arrows()

        this.storeImgSize(imgLoader, i)

        const { width, height, left, top } = this.fit(i, this.elems.wrapper)
        return this.center(width, height, left, top, 0)
    }

    center(width, height, left, top, duration) {
        return $(this.elems.content)
            .css('overflow', 'visible')
            .animate(
                {
                    width: width,
                    height: height,
                    left: left,
                    top: top,
                },
                duration
            )
            .promise()
    }

    appear(i) {
        clearTimeout(this.settings.timer)

        return $(this.elems.loader)
            .stop()
            .fadeOut(300, () => {
                $(this.elems.img).attr('src', this.settings.images[i].src)
            })
            .promise()
    }

    fit(i, container) {
        let height
        let width

        const imgHeight = this.settings.images[i].height
        const imgWidth = this.settings.images[i].width
        const holderHeight = container.clientHeight
        const holderWidth = container.clientWidth
        const holderOutMarginH = this.getOutMarginH()
        const holderOutMarginW = this.getOutMarginW()

        const holderGlobalWidth = holderWidth - holderOutMarginW
        const holderGlobalHeight = holderHeight - holderOutMarginH
        const holderGlobalRatio = holderGlobalHeight / holderGlobalWidth
        const holderRatio = holderHeight / holderWidth
        const imgRatio = imgHeight / imgWidth

        if (this.settings.imageSize == 'cover') {
            if (imgRatio < holderRatio) {
                height = holderHeight
                width = height / imgRatio
            } else {
                width = holderWidth
                height = width * imgRatio
            }
        } else if (this.settings.imageSize == 'native') {
            height = imgHeight
            width = imgWidth
        } else {
            if (imgRatio > holderGlobalRatio) {
                height = holderGlobalHeight
                width = height / imgRatio
            } else {
                width = holderGlobalWidth
                height = width * imgRatio
            }
            if (
                this.settings.imageSize === 'default' &&
                (width >= imgWidth || height >= imgHeight)
            ) {
                width = imgWidth
                height = imgHeight
            }
        }

        return {
            height: height,
            width: width,
            top: (holderHeight - height) / 2,
            left: (holderWidth - width) / 2,
        }
    }

    change(signe) {
        this.zoomOut(0)
        this.zoomable()

        var requestedImage = this.settings.currentImage + parseInt(signe)
        if (requestedImage > this.settings.lastImage) {
            if (this.settings.loop) {
                return this.load(0)
            }
        } else if (requestedImage < 0) {
            if (this.settings.loop) {
                return this.load(this.settings.lastImage)
            }
        } else {
            return this.load(requestedImage)
        }
    }

    arrows() {
        if (this.settings.loop) {
            $([this.elems.left, this.elems.right]).addClass('active')
        } else if (this.settings.linkImages) {
            // right
            if (this.settings.currentImage == this.settings.lastImage) {
                $(this.elems.right).removeClass('active')
            } else {
                $(this.elems.right).addClass('active')
            }
            // left
            if (this.settings.currentImage === 0) {
                $(this.elems.left).removeClass('active')
            } else {
                $(this.elems.left).addClass('active')
            }
        } else {
            $([this.elems.left, this.elems.right]).removeClass('active')
        }
    }

    description() {
        $(this.elems.description).html(this.settings.images[this.settings.currentImage].title)
    }

    pagination() {
        var last = this.settings.lastImage + 1
        var position = this.settings.currentImage + 1

        $(this.elems.pagination).html(position + ' ' + this.settings.separator2 + last)
    }

    storeImgSize(img, i) {
        if (typeof img === 'undefined') {
            return
        }
        if (!this.settings.images[i].height || !this.settings.images[i].width) {
            this.settings.images[i].height = img.height
            this.settings.images[i].width = img.width
        }
    }

    close() {
        if (this.settings.fullscreenOpen) {
            this.exitFullScreen()
            return
        }

        var els = [this.elems.overlay, this.elems.loader, this.elems.wrapper]
        var def = $.when($(els).fadeOut(200)).done(() => {
            this.elems.domContainer.removeClass('chocolat-open')
        })
        this.settings.currentImage = false

        return def
    }

    destroy() {
        this.$element.removeData()

        const imgs = this.element.querySelectorAll(this.settings.imageSelector)

        imgs.forEach((el, i) => {
            this.off(el, 'click.chocolat')
        })

        if (!this.settings.initialized) {
            return
        }
        if (this.settings.fullscreenOpen) {
            this.exitFullScreen()
        }
        this.settings.currentImage = false
        this.settings.initialized = false
        this.elems.domContainer.removeClass(this._cssClasses.join(' '))
        $(this.elems.wrapper).remove()
    }

    getOutMarginW() {
        var left = $(this.elems.left).outerWidth(true)
        var right = $(this.elems.right).outerWidth(true)
        return left + right
    }

    getOutMarginH() {
        return $(this.elems.top).outerHeight(true) + $(this.elems.bottom).outerHeight(true)
    }

    markup() {
        this.elems.domContainer.addClass('chocolat-open ' + this.settings.className)
        if (this.settings.imageSize == 'cover') {
            this.elems.domContainer.addClass('chocolat-cover')
        }
        if (this.settings.container !== window) {
            this.elems.domContainer.addClass('chocolat-in-container')
        }

        this.elems.wrapper = document.createElement('div')
        this.elems.wrapper.setAttribute('id', 'chocolat-content-' + this.settings.setIndex)
        this.elems.wrapper.setAttribute('class', 'chocolat-wrapper')
        this.elems.domContainer[0].appendChild(this.elems.wrapper)

        this.elems.overlay = document.createElement('div')
        this.elems.overlay.setAttribute('class', 'chocolat-overlay')
        this.elems.wrapper.appendChild(this.elems.overlay)

        this.elems.loader = document.createElement('div')
        this.elems.loader.setAttribute('class', 'chocolat-loader')
        this.elems.wrapper.appendChild(this.elems.loader)

        this.elems.content = document.createElement('div')
        this.elems.content.setAttribute('class', 'chocolat-content')
        this.elems.wrapper.appendChild(this.elems.content)

        this.elems.img = document.createElement('img')
        this.elems.img.setAttribute('class', 'chocolat-img')
        this.elems.content.appendChild(this.elems.img)

        this.elems.top = document.createElement('div')
        this.elems.top.setAttribute('class', 'chocolat-top')
        this.elems.wrapper.appendChild(this.elems.top)

        this.elems.left = document.createElement('div')
        this.elems.left.setAttribute('class', 'chocolat-left')
        this.elems.wrapper.appendChild(this.elems.left)

        this.elems.right = document.createElement('div')
        this.elems.right.setAttribute('class', 'chocolat-right')
        this.elems.wrapper.appendChild(this.elems.right)

        this.elems.bottom = document.createElement('div')
        this.elems.bottom.setAttribute('class', 'chocolat-bottom')
        this.elems.wrapper.appendChild(this.elems.bottom)

        this.elems.close = document.createElement('span')
        this.elems.close.setAttribute('class', 'chocolat-close')
        this.elems.top.appendChild(this.elems.close)

        this.elems.fullscreen = document.createElement('span')
        this.elems.fullscreen.setAttribute('class', 'chocolat-fullscreen')
        this.elems.bottom.appendChild(this.elems.fullscreen)

        this.elems.description = document.createElement('span')
        this.elems.description.setAttribute('class', 'chocolat-description')
        this.elems.bottom.appendChild(this.elems.description)

        this.elems.pagination = document.createElement('span')
        this.elems.pagination.setAttribute('class', 'chocolat-pagination')
        this.elems.bottom.appendChild(this.elems.pagination)

        this.elems.setTitle = document.createElement('span')
        this.elems.setTitle.setAttribute('class', 'chocolat-set-title')
        this.elems.bottom.appendChild(this.elems.setTitle)

        this.settings.afterMarkup.call(this)
    }

    openFullScreen() {
        var wrapper = this.elems.wrapper

        if (wrapper.requestFullscreen) {
            this.settings.fullscreenOpen = true
            wrapper.requestFullscreen()
        } else if (wrapper.mozRequestFullScreen) {
            this.settings.fullscreenOpen = true
            wrapper.mozRequestFullScreen()
        } else if (wrapper.webkitRequestFullscreen) {
            this.settings.fullscreenOpen = true
            wrapper.webkitRequestFullscreen()
        } else if (wrapper.msRequestFullscreen) {
            wrapper.msRequestFullscreen()
            this.settings.fullscreenOpen = true
        } else {
            this.settings.fullscreenOpen = false
        }
    }

    exitFullScreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen()
            this.settings.fullscreenOpen = false
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen()
            this.settings.fullscreenOpen = false
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen()
            this.settings.fullscreenOpen = false
        } else if (document.msExitFullscreen) {
            document.msExitFullscreen()
            this.settings.fullscreenOpen = false
        } else {
            this.settings.fullscreenOpen = true
        }
    }

    attachListeners() {
        $(document)
            .off('keydown.chocolat')
            .on('keydown.chocolat', (e) => {
                if (this.settings.initialized) {
                    if (e.keyCode == 37) {
                        this.change(-1)
                    } else if (e.keyCode == 39) {
                        this.change(1)
                    } else if (e.keyCode == 27) {
                        this.close()
                    }
                }
            })

        $(this.elems.wrapper)
            .find('.chocolat-right')
            .off('click.chocolat')
            .on('click.chocolat', () => {
                this.change(+1)
            })

        $(this.elems.wrapper)
            .find('.chocolat-left')
            .off('click.chocolat')
            .on('click.chocolat', () => {
                return this.change(-1)
            })

        $([this.elems.overlay, this.elems.close])
            .off('click.chocolat')
            .on('click.chocolat', () => {
                return this.close()
            })

        $(this.elems.fullscreen)
            .off('click.chocolat')
            .on('click.chocolat', () => {
                if (this.settings.fullscreenOpen) {
                    this.exitFullScreen()
                    return
                }

                this.openFullScreen()
            })

        if (this.settings.backgroundClose) {
            $(this.elems.overlay)
                .off('click.chocolat')
                .on('click.chocolat', () => {
                    return this.close()
                })
        }
        $(this.elems.wrapper)
            .off('click.chocolat')
            .on('click.chocolat', (e) => {
                return this.zoomOut(e)
            })

        $(this.elems.wrapper)
            .find('.chocolat-img')
            .off('click.chocolat')
            .on('click.chocolat', (e) => {
                if (
                    this.settings.initialZoomState === null &&
                    this.elems.domContainer.hasClass('chocolat-zoomable')
                ) {
                    e.stopPropagation()
                    return this.zoomIn(e)
                }
            })

        $(this.elems.wrapper).mousemove((e) => {
            if (this.settings.initialZoomState === null) {
                return
            }
            if ($(this.elems.img).is(':animated')) {
                return
            }

            var pos = $(this).offset()
            var height = $(this).height()
            var width = $(this).width()

            var currentImage = this.settings.images[this.settings.currentImage]
            var imgWidth = currentImage.width
            var imgHeight = currentImage.height

            var coord = [e.pageX - width / 2 - pos.left, e.pageY - height / 2 - pos.top]

            var mvtX = 0
            if (imgWidth > width) {
                var paddingX = this.settings.zoomedPaddingX(imgWidth, width)
                mvtX = coord[0] / (width / 2)
                mvtX = ((imgWidth - width) / 2 + paddingX) * mvtX
            }

            var mvtY = 0
            if (imgHeight > height) {
                var paddingY = this.settings.zoomedPaddingY(imgHeight, height)
                mvtY = coord[1] / (height / 2)
                mvtY = ((imgHeight - height) / 2 + paddingY) * mvtY
            }

            var animation = {
                'margin-left': -mvtX + 'px',
                'margin-top': -mvtY + 'px',
            }

            if (typeof e.duration !== 'undefined') {
                $(this.elems.img)
                    .stop(false, true)
                    .animate(animation, e.duration)
            } else {
                $(this.elems.img)
                    .stop(false, true)
                    .css(animation)
            }
        })
        $(window).on('resize', () => {
            if (!this.settings.initialized || this.settings.currentImage === false) {
                return
            }
            this.debounce(50, () => {
                const { width, height, left, top } = this.fit(
                    this.settings.currentImage,
                    this.elems.wrapper
                )

                this.center(width, height, left, top, 0)
                this.zoomable()
            })
        })
    }

    zoomable() {
        var currentImage = this.settings.images[this.settings.currentImage]
        var wrapperWidth = this.elems.wrapper.clientWidth
        var wrapperHeight = this.elems.wrapper.clientHeight

        var isImageZoomable =
            this.settings.enableZoom &&
            (currentImage.width > wrapperWidth || currentImage.height > wrapperHeight)
                ? true
                : false
        var isImageStretched =
            this.elems.img.clientWidth > currentImage.width ||
            this.elems.img.clientHeight > currentImage.height

        if (isImageZoomable && !isImageStretched) {
            this.elems.domContainer.addClass('chocolat-zoomable')
        } else {
            this.elems.domContainer.removeClass('chocolat-zoomable')
        }
    }

    zoomIn(e) {
        this.settings.initialZoomState = this.settings.imageSize
        this.settings.imageSize = 'native'

        var event = $.Event('mousemove')
        event.pageX = e.pageX
        event.pageY = e.pageY
        event.duration = this.settings.duration
        $(this.elems.wrapper).trigger(event)

        this.elems.domContainer.addClass('chocolat-zoomed')
        const { width, height, left, top } = this.fit(
            this.settings.currentImage,
            this.elems.wrapper
        )

        return this.center(width, height, left, top, this.settings.duration)
    }

    zoomOut(e, duration) {
        if (this.settings.initialZoomState === null || this.settings.currentImage === false) {
            return
        }
        duration = duration || this.settings.duration

        this.settings.imageSize = this.settings.initialZoomState
        this.settings.initialZoomState = null
        $(this.elems.img).animate({ margin: 0 }, duration)

        this.elems.domContainer.removeClass('chocolat-zoomed')
        const { width, height, left, top } = this.fit(
            this.settings.currentImage,
            this.elems.wrapper
        )
        return this.center(width, height, left, top, duration)
    }

    setDomContainer() {
        // if container == window
        // domContainer = body
        if (this.settings.container === window) {
            this.elems.domContainer = $('body')
        } else {
            this.elems.domContainer = $(this.settings.container)
        }
    }

    debounce(duration, callback) {
        clearTimeout(this.settings.timerDebounce)
        this.settings.timerDebounce = setTimeout(function() {
            callback()
        }, duration)
    }

    api() {
        return {
            open: (i) => {
                i = parseInt(i) || 0
                return this.init(i)
            },

            close: () => {
                return this.close()
            },

            next: () => {
                return this.change(1)
            },

            prev: () => {
                return this.change(-1)
            },

            goto: (i) => {
                // open alias
                return this.open(i)
            },
            current: () => {
                return this.settings.currentImage
            },

            place: () => {
                return this.place(this.settings.currentImage, this.settings.duration)
            },

            destroy: () => {
                return this.destroy()
            },

            set: (property, value) => {
                this.settings[property] = value
                return value
            },

            get: (property) => {
                return this.settings[property]
            },

            getElem: (name) => {
                return $(this.elems[name])
            },
        }
    }
}
