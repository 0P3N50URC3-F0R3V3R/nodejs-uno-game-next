<template>
    <div class="table" :style="!videoBg ? {backgroundImage: 'url(' + bg + ')'} : {}">
        <video v-if="videoBg" class="table-video-bg" :src="videoBg" autoplay loop muted playsinline></video>
        <div class="grad"></div>
        <slot></slot>
    </div>
</template>

<script>
    export default {
        name: "Board",
        props: {
            bg: { type: String, default: '/img/table.jpg' },
            videoBg: { type: String, default: null }
        }
    }
</script>

<style scoped>
    .table{
        position:absolute;
        width:100%;
        height:100%;
        border-bottom:solid 1px #000;
        border-top:solid 1px #000;
        border-left:solid 1px #9a6515;
        border-right:solid 1px #9a6515;
        border-radius:12px;
        background-size: cover;
        background-position: center;
        box-shadow:0 6px 12px #000;
        transform-style: preserve-3d;
    }
    .table-video-bg {
        position: absolute;
        top: 0; left: 0;
        width: 100%; height: 100%;
        object-fit: cover;
        z-index: 0;
        border-radius: 12px;
    }
    .grad{
        position:relative;
        z-index: 1;
        width:100%;
        height:100px;
        background:url('../../public/img/bg_grad.png')no-repeat;
        background-repeat: round;
    }
</style>